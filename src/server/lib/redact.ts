/**
 * Secret redaction for configuration responses.
 *
 * The settings pages are editors: they need to show *whether* a secret is set, and
 * let the user replace it, but never need to show the secret back. Several
 * endpoints returned stored configuration verbatim, so any client that could read
 * the config could read the TMDb, OMDb, OpenSubtitles and Kodi credentials in
 * plaintext.
 *
 * The scheme is deliberately boring so the client side stays simple:
 *  - a set secret is returned as `REDACTED`
 *  - an unset secret stays `''`
 *  - on write, `REDACTED` means "unchanged", and `''` means "clear it"
 */

export const REDACTED = '••••••••';

export function isRedacted(value: unknown): boolean {
  return value === REDACTED;
}

/** Masks one secret. An empty value stays empty so the UI can tell "not set". */
export function redactSecret(value: string | null | undefined): string {
  return value ? REDACTED : '';
}

/**
 * Applies `redactSecret` to the named keys of an object, leaving everything else
 * untouched. Generic over the record so callers keep their own types.
 */
export function redactFields<T extends object>(value: T, fields: readonly (keyof T)[]): T {
  const out: Record<string, unknown> = { ...(value as Record<string, unknown>) };
  for (const key of fields) {
    const current = value[key];
    if (typeof current === 'string') out[key as string] = redactSecret(current);
  }
  return out as T;
}

/**
 * Merges an incoming config update over the stored value, preserving any secret
 * the client echoed back as `REDACTED`.
 *
 * Without this, saving the settings form would overwrite every stored key with the
 * literal mask — which looks like it worked and silently breaks scraping.
 */
export function mergeSecretUpdate<T extends object>(
  incoming: Partial<T>,
  stored: T,
  secretFields: readonly (keyof T)[]
): T {
  const out: Record<string, unknown> = {
    ...(stored as Record<string, unknown>),
    ...(incoming as Record<string, unknown>),
  };
  for (const key of secretFields) {
    if (isRedacted(incoming[key])) out[key as string] = (stored[key] as unknown) ?? '';
  }
  return out as T;
}
