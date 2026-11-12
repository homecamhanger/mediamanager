/**
 * Outbound URL validation for server-side fetches.
 *
 * Two routes handed a URL straight from the request body to `fetch()`: artwork
 * downloads and subtitle downloads. That is server-side request forgery — the
 * server becomes a proxy for whatever the client names, so a request could probe
 * `http://127.0.0.1:6379`, a router's admin page, or cloud metadata endpoints, and
 * the artwork path even wrote the response to disk.
 *
 * The defence is an allowlist of hosts plus a refusal of anything that resolves
 * into a private address space. Redirects are the subtle part: a permitted host
 * can redirect to `127.0.0.1`, so callers must re-validate after each hop (see
 * `assertSafeFetchUrl` usage with `redirect: 'manual'`).
 */

import dns from 'node:dns/promises';
import net from 'node:net';

/** Hosts the app legitimately downloads artwork and subtitles from. */
const DEFAULT_ALLOWED_HOSTS = [
  'image.tmdb.org',
  'image.tmdb.org.cdn.cloudflare.net',
  'webservice.fanart.tv',
  'assets.fanart.tv',
  'www.thetvdb.com',
  'artworks.thetvdb.com',
  'api.opensubtitles.com',
  'dl.opensubtitles.org',
  'opensubtitles.com',
  'cdn.opensubtitles.com',
  'static.opensubtitles.org',
];

/**
 * Allowed hosts, plus anything `ALLOWED_FETCH_HOSTS` adds (comma separated), plus
 * every host of a configured media source is *not* included — sources are paths,
 * not URLs, and there is no reason to fetch from them over HTTP.
 */
export function allowedFetchHosts(): string[] {
  const extra = (process.env.ALLOWED_FETCH_HOSTS ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
  return [...new Set([...DEFAULT_ALLOWED_HOSTS.map((h) => h.toLowerCase()), ...extra])];
}

/** True for loopback, link-local, and RFC1918/ULA ranges. */
export function isPrivateAddress(address: string): boolean {
  const version = net.isIP(address);
  if (version === 4) {
    const [a, b] = address.split('.').map(Number);
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast/reserved
    return false;
  }
  if (version === 6) {
    const lower = address.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA
    // IPv4-mapped form, e.g. ::ffff:127.0.0.1
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    return false;
  }
  return false;
}

export interface UrlCheckOptions {
  /** Extra hosts to accept beyond the allowlist (used by tests). */
  extraHosts?: readonly string[];
  /** Skip DNS resolution (tests, or hosts known to be static). */
  skipDnsCheck?: boolean;
}

export type UrlCheckResult = { ok: true; url: URL } | { ok: false; reason: string };

/**
 * Validates a URL before the server fetches it.
 *
 * Rejects non-HTTP(S) schemes, hosts outside the allowlist, and — after a DNS
 * lookup — hostnames that resolve to a private address. A caller that follows
 * redirects must call this again for each new location.
 */
export async function checkFetchTarget(
  raw: string | null | undefined,
  options: UrlCheckOptions = {}
): Promise<UrlCheckResult> {
  if (!raw || typeof raw !== 'string') return { ok: false, reason: 'Missing URL' };

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'Invalid URL' };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: `Refusing ${url.protocol} URL` };
  }
  // Credentials in the URL can confuse host checks in intermediaries.
  if (url.username || url.password) return { ok: false, reason: 'URL must not contain credentials' };

  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const allowed = [...allowedFetchHosts(), ...(options.extraHosts ?? []).map((h) => h.toLowerCase())];
  if (!allowed.includes(hostname)) {
    return { ok: false, reason: `Host not allowed: ${hostname}` };
  }

  // A literal IP in the URL is never one of the allowed hostnames by construction.
  if (net.isIP(hostname)) return { ok: false, reason: 'Refusing IP-literal URL' };

  if (!options.skipDnsCheck) {
    try {
      const records = await dns.lookup(hostname, { all: true });
      if (records.some((r) => isPrivateAddress(r.address))) {
        return { ok: false, reason: `Host resolves to a private address: ${hostname}` };
      }
    } catch {
      // Unresolvable now; the fetch will fail on its own.
    }
  }

  return { ok: true, url };
}
