import { describe, expect, it } from 'vitest';
import { getArtworkUrl } from '../src/client/lib/api.js';

/**
 * Artwork is rendered optimistically while the file write is still queued, so
 * `getArtworkUrl` receives values that are not filesystem paths. Those must pass
 * through untouched; only real paths get proxied through /api/artwork/file.
 */
describe('getArtworkUrl', () => {
  it('proxies a filesystem path with an optional cache buster', () => {
    expect(getArtworkUrl('/library/Show/poster.jpg')).toBe(
      '/api/artwork/file?path=%2Flibrary%2FShow%2Fposter.jpg'
    );
    expect(getArtworkUrl('/library/Show/poster.jpg', 7)).toBe(
      '/api/artwork/file?path=%2Flibrary%2FShow%2Fposter.jpg&v=7'
    );
  });

  it('returns null for empty input', () => {
    expect(getArtworkUrl(null)).toBeNull();
    expect(getArtworkUrl(undefined)).toBeNull();
    expect(getArtworkUrl('')).toBeNull();
  });

  it('passes remote and API URLs straight through', () => {
    const remote = 'https://image.tmdb.org/t/p/original/poster.jpg';
    expect(getArtworkUrl(remote)).toBe(remote);
    expect(getArtworkUrl('/api/artwork/file?path=x')).toBe('/api/artwork/file?path=x');
  });

  it('passes optimistic inline previews straight through', () => {
    // An uploaded image shown before the queued write lands.
    const inline = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
    expect(getArtworkUrl(inline)).toBe(inline);
    // A picked local file previewed during the same window.
    expect(getArtworkUrl('blob:http://localhost:5173/9f2c')).toBe(
      'blob:http://localhost:5173/9f2c'
    );
  });

  it('does not append a cache buster to passthrough URLs', () => {
    const inline = 'data:image/png;base64,iVBORw0KGgo=';
    expect(getArtworkUrl(inline, 3)).toBe(inline);
  });
});
