export class ApiError extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string, public readonly reason?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

let loggedOut: () => void = () => {};
export function setLoggedOutHandler(fn: () => void): void { loggedOut = fn; }

function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|;\s*)dbl_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

let refreshing: Promise<boolean> | null = null;

async function doRefresh(): Promise<boolean> {
  const headers: Record<string, string> = {};
  const t = csrfToken();
  if (t) headers['X-CSRF-Token'] = t;
  try {
    const res = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'same-origin', headers });
    return res.ok;
  } catch {
    // Offline / DNS / abort: treat exactly like a rejected refresh so the caller
    // gets a typed ApiError instead of a raw TypeError.
    return false;
  }
}

interface Opts { method?: string; body?: unknown; idempotencyKey?: string; }

export async function apiFetch<T>(path: string, opts: Opts = {}): Promise<T> {
  return run<T>(path, opts, false);
}

async function run<T>(path: string, opts: Opts, isRetry: boolean): Promise<T> {
  const method = opts.method ?? 'GET';
  const headers: Record<string, string> = {};
  // Only advertise a JSON body when we are actually sending one. A body-less POST
  // (e.g. /auth/logout) with Content-Type: application/json makes Fastify reject
  // the request before the route runs (FST_ERR_CTP_EMPTY_JSON_BODY).
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  if (method !== 'GET' && method !== 'HEAD') {
    const t = csrfToken();
    if (t) headers['X-CSRF-Token'] = t;
    if (opts.idempotencyKey) headers['Idempotency-Key'] = opts.idempotencyKey;
  }

  const res = await fetch(`/api/v1${path}`, {
    method,
    credentials: 'same-origin',
    headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });

  if (res.status === 401 && !isRetry && !path.startsWith('/auth/')) {
    const ok = await (refreshing ??= doRefresh().finally(() => { refreshing = null; }));
    if (ok) return run<T>(path, opts, true);
    loggedOut();
    throw new ApiError(401, 'SESSION_EXPIRED', 'Your session has expired');
  }

  if (!res.ok) {
    const parsed = await res.json().catch(() => null) as { error?: { code?: string; message?: string; reason?: string } } | null;
    throw new ApiError(
      res.status,
      parsed?.error?.code ?? 'UNKNOWN',
      parsed?.error?.message ?? res.statusText,
      parsed?.error?.reason,
    );
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
