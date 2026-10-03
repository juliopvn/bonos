// Falla al arrancar (no en la primera petición) si la configuración es inválida.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs' && process.env.NEXT_PHASE !== 'phase-production-build') {
    const { getEnv } = await import('./lib/env');
    getEnv();
  }
}
