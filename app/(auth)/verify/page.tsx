import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Enlace no válido' };

const MESSAGES: Record<string, string> = {
  used: 'Este enlace ya se usó. Cada enlace funciona una sola vez.',
  expired: 'Este enlace caducó. Pide uno nuevo para entrar.',
  invalid: 'Este enlace no es válido. Pide uno nuevo para entrar.',
};

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = MESSAGES[error ?? 'invalid'] ?? MESSAGES.invalid;
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="card card-pad w-full" role="alert" data-testid="verify-error">
        <p className="eyebrow">No pudimos iniciar tu sesión</p>
        <h1 className="display mt-1 text-3xl">Enlace no válido</h1>
        <p className="muted mt-3">{message}</p>
        <Link href="/login" className="btn btn-primary mt-6">
          Pedir un enlace nuevo
        </Link>
      </div>
    </main>
  );
}
