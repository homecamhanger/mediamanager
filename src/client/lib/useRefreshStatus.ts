/**
 * Turns "a refresh is happening" into something a person can actually read.
 *
 * The panels revalidate in the background after painting, and on a local disk that
 * takes about ten milliseconds. Binding an indicator straight to that boolean makes
 * it flash for a single frame, which reads as a rendering glitch rather than as
 * information — worse than showing nothing.
 *
 * So the indicator follows the user's perception instead of the request:
 *
 *  - A refresh shorter than `appearAfterMs` shows nothing at all. Most are, and
 *    announcing every one of them would be noise.
 *  - A slower one shows "Updating…" and keeps it on screen for at least
 *    `minVisibleMs`, so it cannot flash past even if the request lands mid-frame.
 *  - When it finishes, the indicator switches to "Up to date" for `doneVisibleMs`
 *    and then disappears — the completion the user asked to be told about, without
 *    leaving a permanent badge behind.
 *
 * Timers are the whole mechanism, so every transition is testable with fake clocks.
 */

import { useEffect, useRef, useState } from 'react';

export type RefreshStatus = 'idle' | 'updating' | 'updated';

export interface RefreshStatusOptions {
  /** Refreshes faster than this are not announced at all. */
  appearAfterMs?: number;
  /** Once announced, stay on screen at least this long. */
  minVisibleMs?: number;
  /** How long "Up to date" remains after the work finishes. */
  doneVisibleMs?: number;
}

export const REFRESH_TIMING = {
  appearAfterMs: 180,
  minVisibleMs: 450,
  doneVisibleMs: 1500,
} as const;

export function useRefreshStatus(
  active: boolean,
  options: RefreshStatusOptions = {},
): RefreshStatus {
  const { appearAfterMs, minVisibleMs, doneVisibleMs } = { ...REFRESH_TIMING, ...options };
  const [status, setStatus] = useState<RefreshStatus>('idle');
  // When the indicator was first put on screen; `null` while it has never been shown
  // for the refresh in progress, which is what makes a fast refresh silent.
  const shownAtRef = useRef<number | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  useEffect(() => {
    const clearTimers = () => {
      for (const t of timersRef.current) clearTimeout(t);
      timersRef.current = [];
    };
    clearTimers();

    if (active) {
      // A new refresh may start while "Up to date" is still on screen; it gets its
      // own lifecycle rather than inheriting the previous one.
      shownAtRef.current = null;
      timersRef.current.push(
        setTimeout(() => {
          shownAtRef.current = Date.now();
          setStatus('updating');
        }, appearAfterMs),
      );
      return clearTimers;
    }

    if (shownAtRef.current === null) {
      // Finished before it was worth mentioning.
      setStatus('idle');
      return clearTimers;
    }

    const visibleFor = Date.now() - shownAtRef.current;
    const remaining = Math.max(0, minVisibleMs - visibleFor);
    timersRef.current.push(
      setTimeout(() => {
        setStatus('updated');
        shownAtRef.current = null;
        timersRef.current.push(setTimeout(() => setStatus('idle'), doneVisibleMs));
      }, remaining),
    );

    return clearTimers;
  }, [active, appearAfterMs, minVisibleMs, doneVisibleMs]);

  return status;
}
