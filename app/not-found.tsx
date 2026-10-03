import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <div className="card card-pad w-full">
        <p className="eyebrow">Error 404</p>
        <h1 className="display mt-1 text-3xl">No encontramos esa página</h1>
        <p className="muted mt-3">El enlace puede haber cambiado o el recurso ya no existe.</p>
        <Link href="/" className="btn btn-primary mt-6">
          Volver al inicio
        </Link>
      </div>
    </main>
  );
}
