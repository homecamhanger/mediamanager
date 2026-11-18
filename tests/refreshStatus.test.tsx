// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToString } from 'react-dom/server';

/**
 * The indicator's job is to be *legible*, not merely truthful. On a local library a
 * revalidation takes about ten milliseconds; binding a spinner straight to that
 * boolean produces a one-frame flash, which reads as a glitch and tells the user
 * nothing. These tests pin the three properties that make it readable:
 *
 *   1. A fast refresh says nothing at all.
 *   2. A slow one is announced, and stays long enough to be seen.
 *   3. Finishing is announced too — and then the badge goes away for good.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { useRefreshStatus, REFRESH_TIMING } = await import('../src/client/lib/useRefreshStatus.js');
const { RefreshIndicator } = await import('../src/client/components/RefreshIndicator.js');

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  if (root) {
    act(() => root!.unmount());
    root = null;
  }
  container.remove();
  vi.useRealTimers();
});

/** Renders the hook through a tiny harness so its output can be asserted on. */
function Probe({ active }: { active: boolean }) {
  const status = useRefreshStatus(active);
  return <span data-testid="status">{status}</span>;
}

function mount(node: React.ReactElement) {
  root = createRoot(container);
  act(() => root!.render(node));
}

const statusOf = () => container.textContent;

async function advance(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

describe('useRefreshStatus', () => {
  it('stays silent for a refresh that finishes quickly', async () => {
    mount(<Probe active />);
    // Half the announce threshold, then done — nothing should ever have appeared.
    await advance(REFRESH_TIMING.appearAfterMs / 2);
    expect(statusOf()).toBe('idle');

    act(() => root!.render(<Probe active={false} />));
    await advance(5000);
    expect(statusOf()).toBe('idle');
  });

  it('announces a refresh that is still running past the threshold', async () => {
    mount(<Probe active />);
    await advance(REFRESH_TIMING.appearAfterMs + 10);
    expect(statusOf()).toBe('updating');
  });

  it('keeps the indicator visible long enough to read, then confirms and clears', async () => {
    mount(<Probe active />);
    await advance(REFRESH_TIMING.appearAfterMs + 10);
    expect(statusOf()).toBe('updating');

    // Finishes almost immediately after appearing — it must still linger.
    act(() => root!.render(<Probe active={false} />));
    expect(statusOf()).toBe('updating');

    await advance(REFRESH_TIMING.minVisibleMs + 10);
    expect(statusOf()).toBe('updated');

    await advance(REFRESH_TIMING.doneVisibleMs + 10);
    // "Up to date" is not a permanent badge; it clears once acknowledged.
    expect(statusOf()).toBe('idle');
  });

  it('returns to idle when a refresh finishes before it was ever shown', async () => {
    mount(<Probe active />);
    act(() => root!.render(<Probe active={false} />));
    await advance(5000);
    expect(statusOf()).toBe('idle');
  });

  it('cleans up its timers when the panel unmounts mid-refresh', async () => {
    mount(<Probe active />);
    await advance(REFRESH_TIMING.appearAfterMs + 10);
    expect(statusOf()).toBe('updating');

    act(() => root!.unmount());
    root = null;
    // A timer that outlived the component would update unmounted state; let every
    // pending timer fire and assert nothing throws.
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('RefreshIndicator', () => {
  it('renders nothing while a refresh is too quick to mention', () => {
    // Server rendering gives the initial state without any timer elapsed.
    expect(renderToString(<RefreshIndicator active />)).toBe('');
  });

  it('announces updates politely for assistive technology', async () => {
    mount(<RefreshIndicator active />);
    await advance(REFRESH_TIMING.appearAfterMs + 10);

    const live = container.querySelector('[aria-live="polite"]');
    expect(live).not.toBeNull();
    expect(live!.textContent).toContain('Updating');
  });

  it('switches to a confirmation when the refresh completes', async () => {
    mount(<RefreshIndicator active />);
    await advance(REFRESH_TIMING.appearAfterMs + 10);
    act(() => root!.render(<RefreshIndicator active={false} />));
    await advance(REFRESH_TIMING.minVisibleMs + 10);

    expect(container.textContent).toContain('Up to date');
  });
});
