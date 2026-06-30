/** Shape every API route uses for its error responses (`apiError` in routes.ts). */
interface ApiErrorBody {
  error?: { message: string };
}

/**
 * Thin wrapper over `fetch` for the app's JSON API. Throws an `Error` carrying the
 * server's `{ error: { message } }` text (falling back to `fallbackMessage`) when
 * the response isn't ok, and otherwise returns the parsed JSON body typed as `T`.
 * Centralizes the `if (!res.ok) throw new Error(data?.error?.message ?? …)` dance
 * that every mutation in the UI was repeating.
 */
export async function apiFetch<T = unknown>(
  url: string,
  init?: RequestInit,
  fallbackMessage = 'Request failed',
): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new Error(data?.error?.message ?? fallbackMessage);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/** Convenience for a JSON POST: sets the header and serializes `body` when given. */
export function apiPost<T = unknown>(
  url: string,
  body?: unknown,
  fallbackMessage?: string,
): Promise<T> {
  return apiFetch<T>(
    url,
    body === undefined
      ? { method: 'POST' }
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
    fallbackMessage,
  );
}
