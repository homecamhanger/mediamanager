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
  it('renders nothing until something has been queued', async () => {
    await mount();
    expect(text()).toBe('');
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
      (b.textContent ?? '').trim().startsWith('Clear'),
    );
    expect(clear).toBeDefined();

    await act(async () => {
      clear!.click();
    });
    await act(async () => {
      await new Promise((r) => setTimeout(r, 10));
    });
    // Clearing is the only thing that removes completions, and it is deliberate.
    expect(text()).not.toContain('Write NFO: Dune');
  });
});
