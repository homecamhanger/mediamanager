/**
 * Which address the HTTP server listens on.
 *
 * This app can read and write the media library, rewrite NFO files, and browse
 * directories. It has no authentication. On a single machine that is fine; on a
 * LAN address it is an open door to anyone who can reach the port.
 *
 * So the default is loopback and reaching the network has to be deliberate:
 * `HOST=0.0.0.0` (or a specific interface address) is an explicit choice, not
 * something a deploy inherits by accident.
 *
 * The intended deployment is a machine that runs and is browsed locally now, and
 * later a server that is reached from another PC — which is exactly the transition
 * this default forces you to make consciously.
 */

export const LOOPBACK = '127.0.0.1';

/** True for addresses that are only reachable from this machine. */
export function isLoopbackHost(host: string): boolean {
  const h = host.trim().toLowerCase();
  return h === '127.0.0.1' || h === '::1' || h === 'localhost' || h.startsWith('127.');
}

export function resolveBindHost(env: NodeJS.ProcessEnv = process.env): string {
  const configured = env.HOST?.trim();
  return configured ? configured : LOOPBACK;
}

/** Host to print in the startup banner; wildcard binds are not useful to click. */
export function displayHost(host: string): string {
  const h = host.trim().toLowerCase();
  if (h === '0.0.0.0' || h === '::' || h === '[::]') return 'localhost';
  return host;
}

/**
 * Warning text for a non-loopback bind, or null when the bind is local.
 *
 * Kept separate from the logger so the message can be asserted in tests.
 */
export function exposureWarning(host: string): string | null {
  if (isLoopbackHost(host)) return null;
  const where = displayHost(host) === 'localhost' ? 'all interfaces' : host;
  return (
    `Bound to ${where}, so other machines can reach this server. ` +
    'There is no authentication yet — anyone who can reach the port has full access to the library.'
  );
}
