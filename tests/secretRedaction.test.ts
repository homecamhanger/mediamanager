import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterEach, describe, expect, it } from 'vitest';
import { createApiApp } from '../src/server/app.js';
import { MediaDatabase } from '../src/server/db/database.js';
import { REDACTED, isRedacted, mergeSecretUpdate, redactFields, redactSecret } from '../src/server/lib/redact.js';

const tmpDirs: string[] = [];

afterEach(() => {
  for (const d of tmpDirs.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function freshDb() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'redact-'));
  tmpDirs.push(root);
  return new MediaDatabase(path.join(root, 'test.db'));
}

describe('redactSecret', () => {
  it('masks a set secret and leaves an empty one empty', () => {
    expect(redactSecret('super-secret')).toBe(REDACTED);
    expect(redactSecret('')).toBe('');
    expect(redactSecret(null)).toBe('');
    expect(redactSecret(undefined)).toBe('');
  });

  it('distinguishes "set" from "not set" without revealing the value', () => {
    const masked = redactSecret('abc123');
    expect(masked).not.toContain('abc123');
    expect(redactSecret('')).not.toBe(masked);
  });
});

describe('redactFields', () => {
  it('masks only the named fields', () => {
    const cfg = { username: 'me', password: 'hunter2', host: 'kodi.local', port: 8080 };
    const out = redactFields(cfg, ['password'] as const);
    expect(out.password).toBe(REDACTED);
    expect(out.username).toBe('me');
    expect(out.host).toBe('kodi.local');
    expect(out.port).toBe(8080);
  });
});

describe('mergeSecretUpdate', () => {
  it('keeps the stored secret when the client echoes the mask back', () => {
    const stored = { apiKey: 'real-key', language: 'en' };
    const merged = mergeSecretUpdate({ apiKey: REDACTED, language: 'fr' }, stored, ['apiKey'] as const);
    expect(merged.apiKey).toBe('real-key');
    expect(merged.language).toBe('fr');
  });

  it('accepts a genuinely new secret', () => {
    const stored = { apiKey: 'old' };
    const merged = mergeSecretUpdate({ apiKey: 'new' }, stored, ['apiKey'] as const);
    expect(merged.apiKey).toBe('new');
  });

  it('allows clearing a secret with an empty string', () => {
    const stored = { apiKey: 'old' };
    const merged = mergeSecretUpdate({ apiKey: '' }, stored, ['apiKey'] as const);
    expect(merged.apiKey).toBe('');
  });

  it('does not invent a secret when none was stored', () => {
    const merged = mergeSecretUpdate({ apiKey: REDACTED }, { apiKey: '' }, ['apiKey'] as const);
    expect(merged.apiKey).toBe('');
  });
});

describe('Config endpoints', () => {
  it('never returns scraper API keys', async () => {
    const db = freshDb();
    const app = createApiApp(db);
    db.setSetting('scraper_providers', [
      { id: 'tmdb', name: 'TMDb', description: '', supports: ['movie'], requiresKey: true, apiKey: 'tmdb-secret', enabled: true, priority: 1, language: 'en-US', useDemoFallback: false },
    ]);

    const res = await request(app).get('/api/scrapers/config');
    expect(res.status).toBe(200);
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('tmdb-secret');
    expect(res.body.providers[0].apiKey).toBe(REDACTED);
  });

  it('preserves a stored scraper key when the editor saves the mask back', async () => {
    const db = freshDb();
    const app = createApiApp(db);
    const provider = {
      id: 'tmdb',
      name: 'TMDb',
      description: '',
      supports: ['movie'],
      requiresKey: true,
      apiKey: 'tmdb-secret',
      enabled: true,
      priority: 1,
      language: 'en-US',
      useDemoFallback: false,
    };
    db.setSetting('scraper_providers', [provider]);

    // Load the config (key arrives masked), change an unrelated field, save.
    const loaded = await request(app).get('/api/scrapers/config');
    const edited = { ...loaded.body.providers[0], language: 'de-DE' };
    await request(app).put('/api/scrapers/config').send({ providers: [edited] });

    // The real key must still be on disk — not the mask.
    const stored = db.getSetting<Array<{ apiKey: string; language: string }>>('scraper_providers', []);
    expect(stored[0].apiKey).toBe('tmdb-secret');
    expect(stored[0].language).toBe('de-DE');
  });

  it('never returns subtitle credentials', async () => {
    const db = freshDb();
    const app = createApiApp(db);
    db.setSetting('subtitle_config', {
      openSubtitlesApiKey: 'os-secret',
      openSubtitlesUsername: 'user',
      openSubtitlesPassword: 'os-password',
      subdlApiKey: 'subdl-secret',
      useDemoFallback: true,
    });

    const res = await request(app).get('/api/subtitles/config');
    const body = JSON.stringify(res.body);
    expect(body).not.toContain('os-secret');
    expect(body).not.toContain('os-password');
    expect(body).not.toContain('subdl-secret');
    expect(res.body.openSubtitlesApiKey).toBe(REDACTED);
    // Non-secret fields still readable.
    expect(res.body.openSubtitlesUsername).toBe('user');
  });

  it('never returns the Kodi RPC password', async () => {
    const db = freshDb();
    const app = createApiApp(db);
    db.setSetting('kodi_rpc', {
      enabled: true,
      host: 'kodi.local',
      port: 8080,
      username: 'kodi',
      password: 'kodi-secret',
      pathMappings: [],
      lastConnectedAt: null,
      lastStatus: null,
    });

    const res = await request(app).get('/api/settings/kodi');
    expect(JSON.stringify(res.body)).not.toContain('kodi-secret');
    expect(res.body.password).toBe(REDACTED);
    expect(res.body.host).toBe('kodi.local');
  });

  it('flags whether a secret is configured without exposing it', () => {
    // The dashboard's "configured" badge must keep working off the presence of a key.
    expect(isRedacted(redactSecret('anything'))).toBe(true);
    expect(isRedacted(redactSecret(''))).toBe(false);
  });
});
