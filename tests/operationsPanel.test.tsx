// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

/**
 * The operations panel must never be lost.
 *
 * The previous toast had two failures the user named: it was easy to hide with no way
 * back, and completed work was cleared automatically, so there was no record of what
 * ran. These tests pin the replacement: a launcher that survives collapsing, and a
 * scrollable history whose entries stay until cleared.
 */

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const { fileOperations } = await import('../src/client/lib/fileOperations.js');
const { setTaskRunner } = await import('../src/client/lib/fileOperationTasks.js');
const { FileOperationsPanel } = await import('../src/client/components/FileOperationsPanel.js');

let container: HTMLDivElement;
let root: Root;

/** A real task shape; the runner is stubbed below so nothing leaves the browser. */
function quickTask(tag: string) {
  return { kind: 'nfo' as const, mediaType: 'movie' as const, mediaId: 1, xml: tag };
}

/** Marks writes as successful without any network. */
function useSuccessfulRunner() {
  setTaskRunner(async (task) => ({
    detail: task.kind === 'nfo' ? `wrote ${task.xml}` : 'ok',
  }));
}

/** Marks every write as failing, so the failure state can be exercised. */
function useFailingRunner() {
  setTaskRunner(async () => {
    throw new Error('disk unavailable');
  });
}

beforeEach(() => {
  useSuccessfulRunner();
  fileOperations.reset();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => {
    root.unmount();
  });
  container.remove();
  fileOperations.reset();
  setTaskRunner(null);
});

async function mount() {
  await act(async () => {
    root.render(<FileOperationsPanel />);
  });
}

const text = () => container.textContent ?? '';

describe('operations panel', () => {
  it('offers a launcher even before anything has been queued', async () => {
    // The panel used to render nothing at all when empty, which is why the entry point
    // could not be found. A quiet launcher must exist from the start.
    await mount();
    expect(text()).toContain('Operations');
    expect(container.querySelector('#file-operations-list')).toBeNull();
  });

  it('shows completed work with its status instead of discarding it', async () => {
    // The old toast auto-cleared successes after six seconds.
    await mount();
    await act(async () => {
      fileOperations.enqueue({ label: 'Write NFO: Dune', task: quickTask('a') });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(text()).toContain('Write NFO: Dune');
    expect(text()).toContain('Done');
    // And it does not quietly disappear.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });
    expect(text()).toContain('Write NFO: Dune');
  });

  it('stays reachable after collapsing, so it cannot be lost', async () => {
    await act(async () => {
      fileOperations.enqueue({ label: 'Write NFO: Dune', task: quickTask('a') });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await mount();

    const header = () => container.querySelector('header, button[aria-controls="file-operations-list"]') as HTMLElement | null;
    expect(header()).not.toBeNull();

    // Collapse.
    await act(async () => {
      header()!.click();
    });
    // The list is gone but the launcher remains — this is the "get back to it" part.
    expect(container.querySelector('#file-operations-list')).toBeNull();
    const launcher = container.querySelector('button[aria-controls="file-operations-list"]');
    expect(launcher).not.toBeNull();

    // Reopen.
    await act(async () => {
      (launcher as HTMLElement).click();
    });
    expect(container.querySelector('#file-operations-list')).not.toBeNull();
    expect(text()).toContain('Write NFO: Dune');
  });

  it('keeps a scrollable history of several completed operations', async () => {
    await act(async () => {
      for (let i = 0; i < 5; i += 1) {
        fileOperations.enqueue({ label: `Operation ${i}`, task: quickTask(String(i)) });
      }
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80));
    });
    await mount();

    const list = container.querySelector('#file-operations-list');
    expect(list).not.toBeNull();
    expect(list!.className).toContain('overflow-y-auto');
    for (let i = 0; i < 5; i += 1) expect(text()).toContain(`Operation ${i}`);
  });

  it('filters to failures so a problem is easy to find', async () => {
    useFailingRunner();
    await act(async () => {
      fileOperations.enqueue({ label: 'Broken write', task: quickTask('x') });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 40));
    });
    await mount();

    const failedFilter = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').toLowerCase().includes('failed'),
    );
    expect(failedFilter).toBeDefined();
    await act(async () => {
      failedFilter!.click();
    });
    expect(text()).not.toContain('Operation 0');
  });

  it('offers to clear history explicitly', async () => {
    await act(async () => {
      fileOperations.enqueue({ label: 'Write NFO: Dune', task: quickTask('a') });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await mount();

    const clear = [...container.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').trim() === 'Clear',
    );
    expect(clear).toBeDefined();

    await act(async () => {
      clear!.click();
    });
    // Clearing is the only thing that removes completions, so it asks first — the
    // confirmation steps are covered in their own block below.
    const confirm = Array.from(container.querySelectorAll('[role="alertdialog"] button')).find((b) =>
      (b.textContent ?? '').trim().startsWith('Clear completed'),
    ) as HTMLElement;
    await act(async () => {
      confirm.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    expect(text()).not.toContain('Write NFO: Dune');
  });
});

/**
 * Clearing is the one destructive action in the panel, and the history is the only
 * record of what ran. These pin the confirmation: no single click may destroy it, and
 * Cancel must return with everything intact.
 */
describe('clear confirmation', () => {
  const clearButton = () =>
    Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Clear') as
      | HTMLElement
      | undefined;

  async function queueOne() {
    await act(async () => {
      fileOperations.enqueue({ label: 'Write NFO: Dune', task: quickTask('a') });
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    await mount();
  }

  it('asks before clearing instead of clearing on one click', async () => {
    await queueOne();
    expect(text()).toContain('Write NFO: Dune');

    await act(async () => {
      clearButton()!.click();
    });

    // The dialog is present and nothing has been removed yet.
    expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
    expect(text()).toContain('Write NFO: Dune');
  });

  it('keeps the history when the confirmation is cancelled', async () => {
    await queueOne();
    await act(async () => {
      clearButton()!.click();
    });

    const cancel = Array.from(container.querySelectorAll('[role="alertdialog"] button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    ) as HTMLElement;
    await act(async () => {
      cancel.click();
    });

    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    // The record survived, which is the point of asking.
    expect(text()).toContain('Write NFO: Dune');
  });

  it('clears completed work once confirmed', async () => {
    await queueOne();
    await act(async () => {
      clearButton()!.click();
    });

    const confirm = Array.from(container.querySelectorAll('[role="alertdialog"] button')).find((b) =>
      b.textContent?.trim().startsWith('Clear completed'),
    ) as HTMLElement;
    await act(async () => {
      confirm.click();
    });

    expect(text()).not.toContain('Write NFO: Dune');
  });
});

/**
 * Bulk jobs belong in the same list as item writes.
 *
 * They used to be visible only while running, in a ribbon strip that dropped them on
 * completion — so a finished scan or batch scrape left no record. These pin the merge:
 * jobs appear in the panel, keep their final counts, and are not lost when they end.
 */
describe('bulk jobs in the history', () => {
  const finishedJob = {
    jobId: 'job-1',
    kind: 'scrape' as const,
    label: 'Batch Scrape Unscraped',
    status: 'completed' as const,
    overallPercent: 100,
    processedCount: 12,
    totalCount: 12,
    succeededCount: 11,
    skippedCount: 1,
    failedCount: 0,
    cancelRequested: false,
    startedAt: new Date().toISOString(),
    finishedAt: new Date().toISOString(),
  };

  it('lists a completed bulk job after it finishes', async () => {
    await act(async () => {
      root.render(<FileOperationsPanel batchJobs={[finishedJob]} />);
    });
    expect(text()).toContain('Batch Scrape Unscraped');
    expect(text()).toContain('Done');
    // Its counts survive, which is the point of keeping it.
    expect(text()).toContain('11 ok');
    expect(text()).toContain('1 skipped');
  });

  it('lists a completed scan with what it found', async () => {
    const scan = {
      jobId: 'scan-1',
      sourceId: 1,
      sourceName: 'Movies',
      sourcePath: '/lib/Movies',
      mediaKind: 'movie' as const,
      status: 'completed' as const,
      overallPercent: 100,
      itemsProcessed: 11,
      itemsTotal: 11,
      moviesScanned: 11,
      showsScanned: 0,
      episodesScanned: 0,
      steps: [],
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
    };
    await act(async () => {
      root.render(<FileOperationsPanel scanJobs={[scan]} />);
    });
    expect(text()).toContain('Scan Movies');
    expect(text()).toContain('11 films');
  });

  it('offers cancel only for a job still running', async () => {
    const running = { ...finishedJob, jobId: 'job-2', status: 'running' as const, finishedAt: null };
    await act(async () => {
      root.render(<FileOperationsPanel batchJobs={[running]} onCancelJob={() => {}} />);
    });
    const cancel = Array.from(container.querySelectorAll('button')).find(
      (b) => b.textContent?.trim() === 'Cancel',
    );
    expect(cancel).toBeDefined();
  });
});
