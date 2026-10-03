import { z } from 'zod';

const bool = (fallback: 'true' | 'false') =>
  z
    .enum(['true', 'false'])
    .default(fallback)
    .transform((v) => v === 'true');

const emptyToUndefined = (v: unknown) => (v === '' ? undefined : v);
const optional = <T extends z.ZodType>(schema: T) => z.preprocess(emptyToUndefined, schema.optional());

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_URL: optional(z.url()),
    VERCEL_URL: optional(z.string()),

    AUTH_SECRET: z.string().min(32, 'AUTH_SECRET debe tener al menos 32 caracteres'),
    MAGIC_LINK_TTL_MINUTES: z.coerce.number().int().positive().default(15),
    SESSION_TTL_DAYS: z.coerce.number().int().positive().default(7),
    ADMIN_EMAILS: z
      .string()
      .default('')
      .transform((v) =>
        v
          .split(',')
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      ),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(5),

    MONGODB_URI: z.string().min(1),
    MONGODB_DB: z.string().min(1),

    MAIL_DRIVER: z.enum(['smtp', 'resend', 'memory']).default('smtp'),
    MAIL_FROM: z.string().min(3).default('Bonos <no-reply@localhost>'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: z.coerce.number().int().positive().default(1025),
    MAILHOG_API_URL: optional(z.url()),
    RESEND_API_KEY: optional(z.string()),

    STORAGE_DRIVER: z.enum(['s3', 'fs']).default('s3'),
    STORAGE_FS_DIR: z.string().default('.tmp/storage'),
    S3_ENDPOINT: optional(z.url()),
    S3_REGION: z.string().default('us-east-1'),
    S3_BUCKET: optional(z.string()),
    S3_ACCESS_KEY_ID: optional(z.string()),
    S3_SECRET_ACCESS_KEY: optional(z.string()),
    S3_FORCE_PATH_STYLE: bool('true'),
    S3_PRESIGNED_TTL_SECONDS: z.coerce.number().int().positive().default(300),

    CRON_SECRET: z.string().min(8, 'CRON_SECRET debe tener al menos 8 caracteres'),

    ALERT_PRICE_MOVE_BPS: z.coerce.number().int().positive().default(200),
    ALERT_CONCENTRATION_PCT: z.coerce.number().int().min(1).max(100).default(30),

    SEED_PROFILE: z.enum(['dev', 'e2e', 'demo']).default('dev'),
    ALLOW_SEED: bool('false'),

    BASE_URL: optional(z.url()),
    E2E_MODE: bool('false'),
    E2E_MAILBOX: z.enum(['mailhog', 'memory']).default('mailhog'),
    E2E_MONGO: z.enum(['external', 'memory']).default('external'),
  })
  .superRefine((env, ctx) => {
    const need = (cond: boolean, path: string, message: string) => {
      if (!cond) ctx.addIssue({ code: 'custom', path: [path], message });
    };
    if (env.STORAGE_DRIVER === 's3') {
      need(!!env.S3_ENDPOINT, 'S3_ENDPOINT', 'requerido con STORAGE_DRIVER=s3');
      need(!!env.S3_BUCKET, 'S3_BUCKET', 'requerido con STORAGE_DRIVER=s3');
      need(!!env.S3_ACCESS_KEY_ID, 'S3_ACCESS_KEY_ID', 'requerido con STORAGE_DRIVER=s3');
      need(!!env.S3_SECRET_ACCESS_KEY, 'S3_SECRET_ACCESS_KEY', 'requerido con STORAGE_DRIVER=s3');
    }
    need(
      env.MAIL_DRIVER !== 'resend' || !!env.RESEND_API_KEY,
      'RESEND_API_KEY',
      'requerido con MAIL_DRIVER=resend',
    );
    if (env.NODE_ENV === 'production' && !env.E2E_MODE) {
      need(env.MAIL_DRIVER !== 'memory', 'MAIL_DRIVER', 'memory solo se permite con E2E_MODE=true');
      need(env.STORAGE_DRIVER !== 'fs', 'STORAGE_DRIVER', 'fs solo se permite con E2E_MODE=true');
    }
  });

export type Env = z.infer<typeof schema> & { APP_BASE_URL: string };

let cached: Env | undefined;

/** Valida y devuelve las variables de entorno (memoizado). Lanza con un mensaje claro si falta alguna. */
export function getEnv(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.') || '(env)'}: ${i.message}`);
    throw new Error(`Variables de entorno inválidas:\n${lines.join('\n')}\nRevisa .env.example.`);
  }
  const env = parsed.data;
  const APP_BASE_URL = (
    env.APP_URL ?? (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'http://localhost:3000')
  ).replace(/\/$/, '');
  cached = { ...env, APP_BASE_URL };
  return cached;
}

/** Solo para tests: permite re-evaluar process.env. */
export function resetEnvCache() {
  cached = undefined;
}
