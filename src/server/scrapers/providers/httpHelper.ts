export async function fetchJsonWithTimeout<T>(
  url: string,
  options?: RequestInit & { timeoutMs?: number }
): Promise<T | null> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), options?.timeoutMs ?? 4500);
  try {
    const res = await fetch(url, {
      ...options,
      signal: ctrl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'KodiVault-MediaManager/1.0',
        ...(options?.headers ?? {}),
      },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    clearTimeout(timer);
    return null;
  }
}
