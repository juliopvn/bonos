import { ObjectId } from 'mongodb';
import { badRequest } from './http';

export function idParam(value: string): ObjectId {
  if (!ObjectId.isValid(value) || value.length !== 24) throw badRequest('Identificador inválido');
  return new ObjectId(value);
}
