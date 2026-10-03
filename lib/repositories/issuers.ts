import { ObjectId } from 'mongodb';
import { col } from '../db';
import { conflict, notFound } from '../http';
import type { IssuerDoc } from '../types';

export async function listIssuers(): Promise<IssuerDoc[]> {
  return (await col('issuers')).find().sort({ name: 1 }).toArray();
}

export async function getIssuer(id: ObjectId): Promise<IssuerDoc> {
  const issuer = await (await col('issuers')).findOne({ _id: id });
  if (!issuer) throw notFound('Emisor');
  return issuer;
}

export async function listSectors(): Promise<string[]> {
  return ((await (await col('issuers')).distinct('sector')) as string[]).sort();
}

export async function createIssuer(input: {
  name: string;
  sector: string;
  country: string;
  rating: string;
  agency: string;
}): Promise<IssuerDoc> {
  const now = new Date();
  const doc: IssuerDoc = {
    _id: new ObjectId(),
    name: input.name,
    sector: input.sector,
    country: input.country,
    rating: input.rating,
    ratingHistory: [{ rating: input.rating, date: now, agency: input.agency }],
    createdAt: now,
  };
  try {
    await (await col('issuers')).insertOne(doc);
  } catch (e) {
    if ((e as { code?: number }).code === 11000)
      throw conflict('Ya existe un emisor con ese nombre');
    throw e;
  }
  return doc;
}

export async function updateIssuer(
  id: ObjectId,
  patch: { name?: string; sector?: string; country?: string },
): Promise<IssuerDoc> {
  const res = await (
    await col('issuers')
  ).findOneAndUpdate({ _id: id }, { $set: patch }, { returnDocument: 'after' });
  if (!res) throw notFound('Emisor');
  return res;
}

/** Cambia el rating y registra la entrada en el historial. Devuelve el rating anterior. */
export async function changeIssuerRating(
  id: ObjectId,
  rating: string,
  agency: string,
): Promise<{ previous: string; issuer: IssuerDoc }> {
  const issuers = await col('issuers');
  const before = await issuers.findOne({ _id: id });
  if (!before) throw notFound('Emisor');
  const issuer = await issuers.findOneAndUpdate(
    { _id: id },
    { $set: { rating }, $push: { ratingHistory: { rating, date: new Date(), agency } } },
    { returnDocument: 'after' },
  );
  return { previous: before.rating, issuer: issuer! };
}
