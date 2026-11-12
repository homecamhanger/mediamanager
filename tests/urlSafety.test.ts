import { describe, expect, it } from 'vitest';
import { checkFetchTarget, isPrivateAddress } from '../src/server/lib/urlSafety.js';

describe('isPrivateAddress', () => {
  it('flags loopback, link-local, and RFC1918 ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '127.1.2.3',
      '10.0.0.5',
      '172.16.0.1',
      '172.31.255.254',
      '192.168.1.1',
      '169.254.169.254', // cloud metadata
      '100.64.0.1', // CGNAT
      '0.0.0.0',
      '::1',
      'fe80::1',
      'fd00::1',
      '::ffff:127.0.0.1',
    ]) {
      expect(isPrivateAddress(ip), ip).toBe(true);
    }
  });

  it('permits ordinary public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '172.15.0.1', '172.32.0.1', '203.0.113.10', '2606:4700::1111']) {
      expect(isPrivateAddress(ip), ip).toBe(false);
    }
  });
});

describe('checkFetchTarget', () => {
  it('accepts an allowlisted public host', async () => {
    const res = await checkFetchTarget('https://image.tmdb.org/t/p/original/poster.jpg', {
      skipDnsCheck: true,
    });
    expect(res.ok).toBe(true);
  });

  it('rejects hosts outside the allowlist', async () => {
    const res = await checkFetchTarget('https://evil.example.com/payload.jpg', { skipDnsCheck: true });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toContain('not allowed');
  });

  it('rejects loopback and private IP literals', async () => {
    for (const url of [
      'http://127.0.0.1:6379/',
      'http://localhost:3000/api/settings/fs/browse',
      'http://169.254.169.254/latest/meta-data/',
      'http://[::1]:8080/',
      'http://192.168.1.1/admin',
    ]) {
      const res = await checkFetchTarget(url, { skipDnsCheck: true });
      expect(res.ok, url).toBe(false);
    }
  });

  it('rejects the internal API even though it is http', async () => {
    // The concrete SSRF this prevents: asking the server to call itself.
    const res = await checkFetchTarget('http://127.0.0.1:3000/api/movies', { skipDnsCheck: true });
    expect(res.ok).toBe(false);
  });

  it('rejects non-HTTP schemes', async () => {
    for (const url of ['file:///etc/passwd', 'ftp://example.com/x', 'gopher://x/', 'data:text/html,x']) {
      const res = await checkFetchTarget(url, { skipDnsCheck: true });
      expect(res.ok, url).toBe(false);
    }
  });

  it('rejects credentials embedded in the URL', async () => {
    const res = await checkFetchTarget('https://user:pass@image.tmdb.org/x.jpg', { skipDnsCheck: true });
    expect(res.ok).toBe(false);
  });

  it('rejects missing and malformed input', async () => {
    expect((await checkFetchTarget(null)).ok).toBe(false);
    expect((await checkFetchTarget('')).ok).toBe(false);
    expect((await checkFetchTarget('not a url')).ok).toBe(false);
  });

  it('accepts extra hosts supplied by config', async () => {
    const res = await checkFetchTarget('https://my.mirror.example/art.jpg', {
      extraHosts: ['my.mirror.example'],
      skipDnsCheck: true,
    });
    expect(res.ok).toBe(true);
  });

  it('rejects a hostname that resolves to a private address', async () => {
    // "localtest.me" resolves to 127.0.0.1 for any resolver; this exercises the
    // DNS check that a hostname-only allowlist would miss.
    const res = await checkFetchTarget('https://localtest.me/payload.jpg', {
      extraHosts: ['localtest.me'],
    });
    expect(res.ok).toBe(false);
  });
});
