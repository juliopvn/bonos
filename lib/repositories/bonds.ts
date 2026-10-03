import { ObjectId } from 'mongodb';
import { col } from '../db';
import { notFound } from '../http';
import type { BondDoc, IssuerDoc } from '../types';

export type BondWithIssuer = BondDoc & { issuer: IssuerDoc };

const lookupIssuer = [
  { $lookup: { from: 'issuers', localField: 'issuerId', foreignField: '_id', as: 'issuer' } },
  { $unwind: '$issuer' },
];

export async function getBond(id: ObjectId): Promise<BondDoc> {
  const bond = await (await col('bonds')).findOne({ _id: id });
  if (!bond) throw notFound('Bono');
  return bond;
}

export async function getBondWithIssuer(id: ObjectId): Promise<BondWithIssuer> {
  const [bond] = await (await col('bonds'))
    .aggregate<BondWithIssuer>([{ $match: { _id: id } }, ...lookupIssuer])
    .toArray();
  if (!bond) throw notFound('Bono');
  return bond;
}

export async function listBondsWithIssuer(filter: Record<string, unknown> = {}): Promise<BondWithIssuer[]> {
  return (await col('bonds'))
    .aggregate<BondWithIssuer>([{ $match: filter }, ...lookupIssuer, { $sort: { createdAt: -1, name: 1 } }])
    .toArray();
}

export async function bondsByIds(ids: ObjectId[]): Promise<Map<string, BondWithIssuer>> {
  if (ids.length === 0) return new Map();
  const list = await (await col('bonds'))
    .aggregate<BondWithIssuer>([{ $match: { _id: { $in: ids } } }, ...lookupIssuer])
    .toArray();
  return new Map(list.map((b) => [b._id.toHexString(), b]));
}

export const bondLookupStages = lookupIssuer;
