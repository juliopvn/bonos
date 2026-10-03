/** Cliente fetch para componentes cliente: lanza Error con el mensaje del servidor. */
export async function api<T = unknown>(
  url: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const res = await fetch(url, {
    method: options.method ?? (options.body ? 'POST' : 'GET'),
    headers: options.body instanceof FormData ? undefined : { 'Content-Type': 'application/json' },
    body:
      options.body === undefined
        ? undefined
        : options.body instanceof FormData
          ? options.body
          : JSON.stringify(options.body),
    cache: 'no-store',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? `Error ${res.status}`);
  return data as T;
}
