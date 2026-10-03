import type { ObjectId } from 'mongodb';

/** Tipo serializable (ObjectId/Date → string) para pasar datos de Server a Client Components. */
export type Plain<T> = T extends ObjectId
  ? string
  : T extends Date
    ? string
    : T extends (infer U)[]
      ? Plain<U>[]
      : T extends object
        ? { [K in keyof T]: Plain<T[K]> }
        : T;

export const plain = <T>(v: T): Plain<T> => JSON.parse(JSON.stringify(v)) as Plain<T>;
