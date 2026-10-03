import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code?: string,
  ) {
    super(message);
  }
}

export const unauthorized = () =>
  new HttpError(401, 'Inicia sesión para continuar', 'unauthorized');
export const forbidden = () =>
  new HttpError(403, 'No tienes permiso para esta acción', 'forbidden');
export const notFound = (what = 'Recurso') =>
  new HttpError(404, `${what} no encontrado`, 'not_found');
export const conflict = (msg: string) => new HttpError(409, msg, 'conflict');
export const badRequest = (msg: string) => new HttpError(400, msg, 'bad_request');

type Ctx<P> = { params: Promise<P> };

/** Envuelve un route handler: traduce HttpError y errores de validación a JSON consistente. */
export function route<P = Record<string, string>>(
  handler: (req: Request, ctx: Ctx<P>) => Promise<Response>,
) {
  return async (req: Request, ctx: Ctx<P>): Promise<Response> => {
    try {
      return await handler(req, ctx);
    } catch (e) {
      if (e instanceof HttpError) {
        return NextResponse.json({ error: e.message, code: e.code }, { status: e.status });
      }
      if (e instanceof ZodError) {
        return NextResponse.json(
          {
            error: e.issues.map((i) => `${i.path.join('.') || 'cuerpo'}: ${i.message}`).join('; '),
            code: 'validation',
          },
          { status: 400 },
        );
      }
      console.error('[api]', e);
      return NextResponse.json({ error: 'Error interno', code: 'internal' }, { status: 500 });
    }
  };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw badRequest('El cuerpo debe ser JSON válido');
  }
}

export const ok = <T>(data: T, init?: ResponseInit) => NextResponse.json(data, init);
