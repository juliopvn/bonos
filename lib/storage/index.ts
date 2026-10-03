import { createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { getEnv } from '../env';

let s3: S3Client | undefined;
let bucketReady: Promise<void> | undefined;

function getS3(): S3Client {
  if (!s3) {
    const env = getEnv();
    s3 = new S3Client({
      endpoint: env.S3_ENDPOINT,
      region: env.S3_REGION,
      forcePathStyle: env.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.S3_ACCESS_KEY_ID!,
        secretAccessKey: env.S3_SECRET_ACCESS_KEY!,
      },
    });
  }
  return s3;
}

/** Garantiza que el bucket existe (local: lo crea; prod/R2: ya existe y solo se comprueba). */
async function ensureBucket(): Promise<void> {
  bucketReady ??= (async () => {
    const env = getEnv();
    const client = getS3();
    try {
      await client.send(new HeadBucketCommand({ Bucket: env.S3_BUCKET }));
    } catch {
      await client.send(new CreateBucketCommand({ Bucket: env.S3_BUCKET }));
    }
  })().catch((e) => {
    bucketReady = undefined;
    throw e;
  });
  return bucketReady;
}

const fsPath = (key: string) => {
  const root = path.resolve(getEnv().STORAGE_FS_DIR);
  const full = path.resolve(root, key);
  if (!full.startsWith(root + path.sep)) throw new Error('Clave de almacenamiento inválida');
  return full;
};

export async function putObject(key: string, body: Buffer, contentType: string): Promise<void> {
  const env = getEnv();
  if (env.STORAGE_DRIVER === 'fs') {
    const file = fsPath(key);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, body);
    return;
  }
  await ensureBucket();
  await getS3().send(
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType }),
  );
}

/** Lectura directa (solo driver fs, para la descarga firmada por la app). */
export async function readFsObject(key: string): Promise<Buffer> {
  return readFile(fsPath(key));
}

const sign = (payload: string) =>
  createHmac('sha256', getEnv().AUTH_SECRET).update(payload).digest('hex');

export function verifyFsSignature(key: string, exp: number, sig: string): boolean {
  if (!Number.isFinite(exp) || exp < Date.now() / 1000) return false;
  const expected = Buffer.from(sign(`${key}.${exp}`));
  const given = Buffer.from(sig);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** URL de descarga de corta duración. s3 → prefirmada; fs → firmada por la app. */
export async function getDownloadUrl(key: string, fileName: string): Promise<string> {
  const env = getEnv();
  const ttl = env.S3_PRESIGNED_TTL_SECONDS;
  if (env.STORAGE_DRIVER === 'fs') {
    const exp = Math.floor(Date.now() / 1000) + ttl;
    const params = new URLSearchParams({
      key,
      exp: String(exp),
      sig: sign(`${key}.${exp}`),
      name: fileName,
    });
    return `${env.APP_BASE_URL}/api/storage/download?${params}`;
  }
  await ensureBucket();
  return getSignedUrl(
    getS3(),
    new GetObjectCommand({
      Bucket: env.S3_BUCKET,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${encodeURIComponent(fileName)}"`,
    }),
    { expiresIn: ttl },
  );
}

export async function pingStorage(): Promise<void> {
  const env = getEnv();
  if (env.STORAGE_DRIVER === 'fs') {
    await mkdir(path.resolve(env.STORAGE_FS_DIR), { recursive: true });
    await access(path.resolve(env.STORAGE_FS_DIR));
    return;
  }
  await ensureBucket();
}
