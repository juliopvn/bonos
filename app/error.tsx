'use client';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="card card-pad w-full" role="alert" data-testid="error-boundary">
        <p className="eyebrow">Algo salió mal</p>
        <h1 className="display mt-1 text-3xl">No pudimos cargar esta vista</h1>
        <p className="muted mt-3">Inténtalo de nuevo. Si el problema continúa, comparte este código con soporte: <span className="num">{error.digest ?? 'sin código'}</span>.</p>
        <button className="btn btn-primary mt-6" onClick={reset}>Reintentar</button>
      </div>
    </main>
  );
}
