/** Tiny fetch wrapper with timeout + JSON parsing + typed errors. */

export class ApiError extends Error {
  constructor(public readonly status: number, message: string, public readonly body?: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function getJson<T>(url: string, init: RequestInit & { timeoutMs?: number } = {}): Promise<T> {
  const { timeoutMs = 12_000, ...rest } = init;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal });
    if (!res.ok) {
      let body: unknown;
      try { body = await res.json(); } catch { /* ignore */ }
      throw new ApiError(res.status, `Request failed (${res.status}) ${url}`, body);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}
