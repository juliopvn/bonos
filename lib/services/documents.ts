import { randomUUID } from 'node:crypto';
import { ObjectId } from 'mongodb';
import { audit } from '../audit';
import { col } from '../db';
import { badRequest, forbidden, notFound } from '../http';
import { getDownloadUrl, putObject } from '../storage';
import type { DocumentDoc, DocumentKind } from '../types';

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const ALLOWED_TYPES: Record<string, string[]> = {
  'application/pdf': ['pdf'],
  'text/csv': ['csv'],
  'image/png': ['png'],
  'image/jpeg': ['jpg', 'jpeg'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['xlsx'],
};

const safeName = (name: string) => name.replace(/[^\w.\-]+/g, '_').slice(-80) || 'documento';

export async function uploadDocument(
  actorId: ObjectId,
  input: { bondId: ObjectId; kind: DocumentKind; file: File },
): Promise<DocumentDoc> {
  const { file } = input;
  const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
  const allowedExts = ALLOWED_TYPES[file.type];
  if (!allowedExts || !allowedExts.includes(ext)) {
    throw badRequest('Tipo de archivo no permitido. Usa PDF, CSV, PNG, JPG o XLSX');
  }
  if (file.size === 0) throw badRequest('El archivo está vacío');
  if (file.size > MAX_UPLOAD_BYTES) throw badRequest('El archivo supera el máximo de 5 MB');

  const bond = await (await col('bonds')).findOne({ _id: input.bondId });
  if (!bond) throw notFound('Bono');
  const body = Buffer.from(await file.arrayBuffer());
  return storeDocument(actorId, bond._id, bond.issuerId, input.kind, safeName(file.name), file.type, body);
}

export async function storeDocument(
  actorId: ObjectId,
  bondId: ObjectId,
  issuerId: ObjectId | null,
  kind: DocumentKind,
  fileName: string,
  contentType: string,
  body: Buffer,
): Promise<DocumentDoc> {
  const storageKey = `bonds/${bondId.toHexString()}/${kind}/${randomUUID()}-${fileName}`;
  await putObject(storageKey, body, contentType);
  const doc: DocumentDoc = {
    _id: new ObjectId(),
    bondId,
    issuerId,
    kind,
    storageKey,
    fileName,
    contentType,
    sizeBytes: body.length,
    uploadedBy: actorId,
    createdAt: new Date(),
  };
  await (await col('documents')).insertOne(doc);
  await audit(actorId, 'document.upload', 'document', doc._id, { bondId: bondId.toHexString(), kind, fileName });
  return doc;
}

export async function listDocuments(bondId: ObjectId): Promise<DocumentDoc[]> {
  return (await col('documents')).find({ bondId }).sort({ createdAt: -1 }).toArray();
}

/** Documentos de los bonos que el inversor posee. */
export async function listDocumentsForInvestor(investorId: ObjectId) {
  const bondIds = await (await col('positions')).distinct('bondId', { investorId, units: { $gt: 0 } });
  return (await col('documents'))
    .aggregate<DocumentDoc & { bond: { name: string; code: string } }>([
      { $match: { bondId: { $in: bondIds } } },
      { $lookup: { from: 'bonds', localField: 'bondId', foreignField: '_id', as: 'bond' } },
      { $unwind: '$bond' },
      { $sort: { createdAt: -1 } },
    ])
    .toArray();
}

/** Autoriza (admin, o inversor con posición en el bono) y devuelve la URL de descarga de corta duración. */
export async function authorizedDownloadUrl(
  user: { id: string; role: 'admin' | 'investor' },
  documentId: ObjectId,
): Promise<string> {
  const doc = await (await col('documents')).findOne({ _id: documentId });
  if (!doc) throw notFound('Documento');
  if (user.role !== 'admin') {
    const holds = doc.bondId
      ? await (await col('positions')).countDocuments({ investorId: new ObjectId(user.id), bondId: doc.bondId, units: { $gt: 0 } })
      : 0;
    if (!holds) throw forbidden();
  }
  return getDownloadUrl(doc.storageKey, doc.fileName);
}
