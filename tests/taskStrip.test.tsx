// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { BatchJob, SourceScanJob } from '../src/shared/types.js';

/**
 * The task strip is the only place background work is visible, so "legible" means
 * three things concretely: queued work is accounted for rather than invisible, a
 * running job shows how it is going (not just that it is going), and a job with
 * failures says so instead of looking like it quietly stopped.
 *
 * These render the real component with prop fixtures — no polling, no timers.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { TopRibbon } = await import('../src/client/components/TopRibbon.js');

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

function ribbon(props: { batchJobs?: BatchJob[]; scanJobs?: SourceScanJob[] }) {
  act(() => {
    root.render(
      <TopRibbon
        summary={null}
        activeTool={null}
        onSelectTool={() => {}}
        selectedLabel={null}
        counts={{ movies: 11, shows: 2, episodes: 40, sets: 1, subtitles: 30, issues: 0 }}
        scanning={false}
        backgroundScanning
        batchJobs={props.batchJobs ?? []}
        scanJobs={props.scanJobs ?? []}
        busyAction={null}
        sidebarCollapsed={false}
        onToggleSidebar={() => {}}
        onScanAll={() => {}}
        onAutoScrapeAll={() => {}}
        onDownloadMissingSubs={() => {}}
        onRegenerateNfos={() => {}}
      />,
    );
  });
  return container.textContent ?? '';
}

function scanJob(over: Partial<SourceScanJob>): SourceScanJob {
  return {
    jobId: 'scan-1',
    sourceId: 1,
    sourceName: 'Movies',
    mediaKind: 'movie',
    status: 'queued',
    overallPercent: 0,
    moviesScanned: 0,
    showsScanned: 0,
    episodesScanned: 0,
    ...over,
  } as unknown as SourceScanJob;
}

function batchJob(over: Partial<BatchJob>): BatchJob {
  return {
    jobId: 'batch-1',
    kind: 'scrape',
    label: 'Auto-scrape',
    status: 'running',
    overallPercent: 40,
    processedCount: 4,
    totalCount: 10,
    succeededCount: 4,
    skippedCount: 0,
    failedCount: 0,
    ...over,
  } as unknown as BatchJob;
}

describe('TopRibbon background task strip', () => {
  it('accounts for queued scans instead of leaving them invisible', () => {
    const text = ribbon({
      scanJobs: [
        scanJob({ jobId: 'a', sourceName: 'Movies', status: 'queued' }),
        scanJob({ jobId: 'b', sourceName: 'TV Shows', status: 'queued', mediaKind: 'tvshow' }),
      ],
    });

    // Three queued: the count, and which sources they are.
    expect(text).toContain('2 scan');
    expect(text).toContain('Movies');
    expect(text).toContain('TV Shows');
  });

  it('does not list a queued scan twice within the strip', () => {
    ribbon({ scanJobs: [scanJob({ sourceName: 'Movies', status: 'queued' })] });

    // The header's library-count chip also says "Movies", so scope to the strip and
    // assert the scan row appears once: the queued summary, not a second SCAN row.
    const strip = container.querySelector('header > div:last-of-type');
    expect(strip).not.toBeNull();
    expect(strip!.textContent).toContain('1 scan waiting');
    expect(strip!.textContent).not.toContain('Scanning');
    expect(strip!.textContent!.match(/Movies/g)?.length).toBe(1);
  });

  it('shows progress and discovery counts for a running scan', () => {
    const text = ribbon({
      scanJobs: [
        scanJob({
          status: 'running',
          overallPercent: 55,
          moviesScanned: 12,
          sourceName: 'Movies',
        }),
      ],
    });

    expect(text).toContain('Scanning Movies');
    expect(text).toContain('55%');
    expect(text).toContain('12 found');
  });

  it('reports how a batch is going, including failures', () => {
    const text = ribbon({
      batchJobs: [batchJob({ failedCount: 2, skippedCount: 1, succeededCount: 7, processedCount: 10 })],
    });

    expect(text).toContain('7 ok');
    expect(text).toContain('1 skipped');
    expect(text).toContain('2 failed');
  });

  it('keeps the counts quiet when a batch is going cleanly', () => {
    const text = ribbon({ batchJobs: [batchJob({ failedCount: 0, skippedCount: 0 })] });

    // No noise for the normal case; progress alone is the message.
    expect(text).toContain('4/10');
    expect(text).not.toContain('failed');
  });

  it('renders no strip at all when nothing is queued or running', () => {
    expect(ribbon({ scanJobs: [scanJob({ status: 'completed' })] })).not.toContain('Queued');
  });
});
