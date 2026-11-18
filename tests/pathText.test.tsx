// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * The rendered half of the path rule.
 *
 * The helpers are covered in pathDisplay.test.ts; this checks the thing the user
 * actually asked for: hover text is *always* the untruncated path, and the visible text
 * is relative to the source root.
 */
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { PathText } = await import('../src/client/components/PathText.js');

const TV_ROOT = '/home/user/mediamanager/sample-library/TV Shows';
const FILE = `${TV_ROOT}/Andor/Season 01/Andor.S01E01.1080p.WEB-DL.DDP5.1.H264.mp4`;
const SOURCES = [
  {
    id: 1,
    name: 'TV',
    path: TV_ROOT,
    mediaKind: 'tvshow' as const,
    nfoNaming: 'movie.nfo' as const,
    artworkNaming: 'folder' as const,
    autoScan: true,
    lastScannedAt: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  },
];

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
});

async function render(node: React.ReactNode) {
  await act(async () => {
    root.render(node);
  });
  return container.firstElementChild as HTMLElement;
}

describe('PathText', () => {
  it('puts the full path in the tooltip', async () => {
    const el = await render(<PathText path={FILE} sources={SOURCES} />);
    expect(el.getAttribute('title')).toBe(FILE);
  });

  it('shows the path relative to its source root', async () => {
    const el = await render(<PathText path={FILE} sources={SOURCES} />);
    expect(el.textContent).toBe('../Andor/Season 01/Andor.S01E01.1080p.WEB-DL.DDP5.1.H264.mp4');
  });

  it('keeps the filename visible while shortening the directory', async () => {
    const el = await render(<PathText path={FILE} sources={SOURCES} />);
    // Left-truncation must not eat the name, which is the identifying part.
    expect(el.textContent?.endsWith('.mp4')).toBe(true);
    expect(el.textContent?.startsWith('../')).toBe(true);
  });

  it('falls back to a shortened form with no sources, tooltip still full', async () => {
    const el = await render(<PathText path={FILE} />);
    expect(el.getAttribute('title')).toBe(FILE);
    expect(el.textContent?.startsWith('…/')).toBe(true);
  });

  it('keeps the directory in the tooltip when showing only the name', async () => {
    const el = await render(<PathText path={FILE} sources={SOURCES} nameOnly />);
    expect(el.textContent).toBe('Andor.S01E01.1080p.WEB-DL.DDP5.1.H264.mp4');
    expect(el.getAttribute('title')).toBe(FILE);
  });

  it('renders nothing for a missing path rather than an empty tooltip', async () => {
    await act(async () => {
      root.render(<PathText path={null} sources={SOURCES} />);
    });
    expect(container.textContent).toBe('');
  });

  it('accepts bare root strings as well as source records', async () => {
    const el = await render(<PathText path={FILE} sources={[TV_ROOT]} />);
    expect(el.textContent?.startsWith('../Andor/')).toBe(true);
  });
});
