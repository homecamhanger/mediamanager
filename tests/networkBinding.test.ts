import { describe, expect, it } from 'vitest';
import { LOOPBACK, displayHost, exposureWarning, isLoopbackHost, resolveBindHost } from '../src/server/lib/networkBinding.js';

/**
 * The bind address is a security boundary here: this server can rewrite NFO files
 * and browse directories, and it has no authentication. These tests pin the
 * default and make sure opening it up stays an explicit, visible choice.
 */
describe('resolveBindHost', () => {
  it('defaults to loopback when HOST is unset', () => {
    expect(resolveBindHost({})).toBe(LOOPBACK);
    expect(resolveBindHost({})).toBe('127.0.0.1');
  });

  it('defaults to loopback when HOST is empty or whitespace', () => {
    expect(resolveBindHost({ HOST: '' })).toBe(LOOPBACK);
    expect(resolveBindHost({ HOST: '   ' })).toBe(LOOPBACK);
  });

  it('honours an explicit HOST', () => {
    expect(resolveBindHost({ HOST: '0.0.0.0' })).toBe('0.0.0.0');
    expect(resolveBindHost({ HOST: '192.168.1.50' })).toBe('192.168.1.50');
    expect(resolveBindHost({ HOST: '::' })).toBe('::');
  });

  it('does not let the common wildcard habit leak into the default', () => {
    // Regression guard: the previous hardcoded bind was 0.0.0.0.
    expect(resolveBindHost({})).not.toBe('0.0.0.0');
  });
});

describe('isLoopbackHost', () => {
  it('recognises loopback forms', () => {
    for (const h of ['127.0.0.1', '127.1.1.1', 'localhost', 'LOCALHOST', '::1', ' 127.0.0.1 ']) {
      expect(isLoopbackHost(h), h).toBe(true);
    }
  });

  it('treats wildcard and LAN addresses as reachable from elsewhere', () => {
    for (const h of ['0.0.0.0', '::', '192.168.0.10', '10.0.0.5', 'example.local']) {
      expect(isLoopbackHost(h), h).toBe(false);
    }
  });
});

describe('displayHost', () => {
  it('shows a clickable address for wildcard binds', () => {
    expect(displayHost('0.0.0.0')).toBe('localhost');
    expect(displayHost('::')).toBe('localhost');
  });

  it('leaves a specific address alone', () => {
    expect(displayHost('127.0.0.1')).toBe('127.0.0.1');
    expect(displayHost('192.168.1.50')).toBe('192.168.1.50');
  });
});

describe('exposureWarning', () => {
  it('stays quiet for a local bind', () => {
    expect(exposureWarning('127.0.0.1')).toBeNull();
    expect(exposureWarning('::1')).toBeNull();
    expect(exposureWarning('localhost')).toBeNull();
  });

  it('warns loudly when the server is reachable from the network', () => {
    const warning = exposureWarning('0.0.0.0');
    expect(warning).not.toBeNull();
    expect(warning).toContain('no authentication');
    // It must say what an attacker gets, not just that it is "exposed".
    expect(warning).toContain('full access to the library');
  });

  it('names the interface for a specific address', () => {
    const warning = exposureWarning('192.168.1.50');
    expect(warning).toContain('192.168.1.50');
  });

  it('describes a wildcard bind as all interfaces', () => {
    expect(exposureWarning('0.0.0.0')).toContain('all interfaces');
  });
});
