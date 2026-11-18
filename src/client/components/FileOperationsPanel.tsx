import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  History,
  Loader2,
  RotateCw,
  Trash2,
  X,
} from 'lucide-react';
import { useFileOperations } from '../lib/useFileOperations.js';
import type { FileOperation, FileOperationStatus } from '../lib/fileOperations.js';
import type { BatchJob, SourceScanJob } from '../../shared/types.js';

/**
 * The background-operations panel.
 *
 * Replaces the old auto-dismissing toast, which had two problems the user named: it
 * was easy to hide and impossible to get back once dismissed, and completed work was
 * cleared out from under you so there was no record of what had happened.
 *
 * Now:
 *  - The launcher is **always present** whenever the queue has ever had anything in
 *    it, so the panel cannot be lost. It collapses to a count and reopens on click.
 *  - Finished operations stay in a **scrollable history** with their status and time,
 *    until cleared deliberately.
 *  - The collapsed pill still surfaces the thing that matters at a glance: work in
 *    flight, or failures.
 *
 * Collapsed state is intentionally not persisted: the launcher is always visible, so
 * there is nothing to restore into.
 */

const STATUS_META: Record<
  FileOperationStatus,
  { label: string; badge: string; icon: React.ReactNode }
> = {
  queued: {
    label: 'Queued',
    badge: 'bg-slate-700/40 text-slate-300 border-slate-600/50',
    icon: <Loader2 className="w-3 h-3 shrink-0 text-slate-500" />,
  },
  running: {
    label: 'Running',
    badge: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
    icon: <Loader2 className="w-3 h-3 shrink-0 animate-spin text-sky-400" />,
  },
  done: {
    label: 'Done',
    badge: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
    icon: <CheckCircle2 className="w-3 h-3 shrink-0 text-emerald-400" />,
  },
  error: {
    label: 'Failed',
    badge: 'bg-rose-500/15 text-rose-300 border-rose-500/40',
    icon: <AlertTriangle className="w-3 h-3 shrink-0 text-rose-400" />,
  },
};

function formatTime(ms: number | null): string {
  if (!ms) return '';
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/**
 * One row in the unified log: either a per-item write or a bulk job.
 *
 * They were two separate surfaces — a floating panel for item writes and a strip in the
 * ribbon for batch jobs — which is why "where is the list of operations" had no single
 * answer. Both are operations; they belong in one list.
 */
type LogEntry =
  | { source: 'item'; id: string; label: string; status: FileOperationStatus; op: FileOperation }
  | {
      source: 'job';
      id: string;
      label: string;
      status: 'queued' | 'running' | 'done' | 'failed';
      job: BatchJob | SourceScanJob;
      isScan: boolean;
    };

const jobStatusToLog = (s: string): 'queued' | 'running' | 'done' | 'failed' =>
  s === 'queued' ? 'queued' : s === 'running' ? 'running' : s === 'completed' ? 'done' : 'failed';

export const FileOperationsPanel: React.FC<{
  /** Bulk jobs, so the panel is the one place that lists everything that ran. */
  batchJobs?: BatchJob[];
  scanJobs?: SourceScanJob[];
  onCancelJob?: (jobId: string) => void;
}> = ({ batchJobs = [], scanJobs = [], onCancelJob }) => {
  const { ops, activeCount, dismiss, retry, clearFinished } = useFileOperations();
  // Starts collapsed when there is nothing to show, so an idle app gets a quiet
  // "Operations" pill rather than an empty panel; expands itself as soon as work exists.
  const [expanded, setExpanded] = useState(false);
  const [everHadWork, setEverHadWork] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'failed' | 'done'>('all');
  // Clearing is destructive to the record, so it asks first. A single misclick should
  // not wipe the only account of what ran.
  const [confirmClear, setConfirmClear] = useState(false);

  const entries: LogEntry[] = useMemo(() => {
    const itemEntries: LogEntry[] = ops.map((o) => ({
      source: 'item',
      id: o.id,
      label: o.label,
      status: o.status,
      op: o,
    }));
    const jobEntries: LogEntry[] = [
      ...batchJobs.map((j) => ({
        source: 'job' as const,
        id: `batch-${j.jobId}`,
        label: j.label,
        status: jobStatusToLog(j.status),
        job: j,
        isScan: false,
      })),
      ...scanJobs.map((j) => ({
        source: 'job' as const,
        id: `scan-${j.jobId}`,
        label: `Scan ${j.sourceName}`,
        status: jobStatusToLog(j.status),
        job: j,
        isScan: true,
      })),
    ];
    return [...itemEntries, ...jobEntries];
  }, [ops, batchJobs, scanJobs]);

  const counts = useMemo(
    () => ({
      queued: entries.filter((o) => o.status === 'queued').length,
      running: entries.filter((o) => o.status === 'running').length,
      done: entries.filter((o) => o.status === 'done').length,
      error: entries.filter((o) => o.status === 'failed').length,
    }),
    [entries],
  );

  /*
   * The launcher is always rendered, even with nothing in it.
   *
   * It used to disappear when empty — which is exactly why the user could not find it:
   * a discoverable "operations" entry point has to exist before the first operation.
   * Empty, it collapses to a quiet pill that opens on click.
   */
  // First work that ever appears opens the panel once, so a user who triggered
  // something sees it without hunting for the pill.
  if (entries.length > 0 && !everHadWork) {
    setEverHadWork(true);
    setExpanded(true);
  }

  if (entries.length === 0 && !expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        className="fixed bottom-4 right-4 z-[60] px-2.5 py-1.5 rounded-xl border border-slate-800 bg-[#111827]/95 text-slate-400 hover:text-slate-200 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer shadow-lg"
        title="Background operations and history"
      >
        <History className="w-3 h-3" />
        Operations
      </button>
    );
  }

  const visible =
    filter === 'all'
      ? entries
      : filter === 'active'
        ? entries.filter((o) => o.status === 'queued' || o.status === 'running')
        : entries.filter((o) => o.status === filter);

  /** When an entry finished, for ordering. Jobs report ISO strings, items milliseconds. */
  const finishedMs = (e: LogEntry): number => {
    if (e.source === 'item') return e.op.finishedAt ?? e.op.queuedAt;
    return e.job.finishedAt ? Date.parse(e.job.finishedAt) : Date.now();
  };

  // Live work floats to the top because that is what needs attention, then everything
  // else by recency — the same order the strip used, now applied to both kinds.
  const ordered = [
    ...visible.filter((o) => o.status === 'running'),
    ...visible.filter((o) => o.status === 'queued'),
    ...visible
      .filter((o) => o.status === 'done' || o.status === 'failed')
      .sort((a, b) => finishedMs(b) - finishedMs(a)),
  ];

  const headline =
    entries.length === 0
      ? 'Operations'
      : activeCount > 0
        ? `${activeCount} operation${activeCount === 1 ? '' : 's'} in progress`
        : counts.error > 0
          ? `${counts.error} failed`
          : `${counts.done} completed`;

  const tone =
    counts.error > 0
      ? 'bg-[#1b1116] border-rose-500/40'
      : activeCount > 0
        ? 'bg-[#0b1420] border-sky-500/40'
        : 'bg-[#0b1712] border-emerald-500/40';

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[24rem] max-w-[calc(100vw-2rem)]">
      <div className={`rounded-xl border shadow-2xl backdrop-blur-sm overflow-hidden ${tone}`}>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer text-left"
          aria-expanded={expanded}
          aria-controls="file-operations-list"
          title={expanded ? 'Collapse operations' : 'Reopen operations'}
        >
          {activeCount > 0 ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-sky-400" />
          ) : counts.error > 0 ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          )}
          <span
            className={`text-[11px] font-bold flex-1 truncate ${
              counts.error > 0 ? 'text-rose-300' : activeCount > 0 ? 'text-sky-300' : 'text-emerald-300'
            }`}
          >
            {headline}
          </span>
          {/* Always-visible counts, so collapsed state still says what happened. */}
          <span className="text-[10px] font-mono text-slate-400 shrink-0">
            {counts.done > 0 && <span className="text-emerald-300/80">{counts.done}✓</span>}
            {counts.error > 0 && <span className="ml-1 text-rose-300">{counts.error}✕</span>}
          </span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
        </button>

        {expanded && (
          <>
            <div className="px-2 py-1.5 border-t border-white/10 flex items-center gap-1 flex-wrap">
              {(['all', 'active', 'failed', 'done'] as const).map((f) => {
                const n =
                  f === 'all'
                    ? ops.length
                    : f === 'active'
                      ? counts.queued + counts.running
                      : f === 'failed'
                        ? counts.error
                        : counts.done;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFilter(f)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-semibold capitalize cursor-pointer transition ${
                      filter === f
                        ? 'bg-sky-500/25 text-sky-200 border border-sky-500/40'
                        : 'text-slate-400 border border-transparent hover:text-slate-200 hover:bg-white/5'
                    }`}
                  >
                    {f === 'all' ? 'All' : f} ({n})
                  </button>
                );
              })}
              {counts.done > 0 && (
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="ml-auto px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-100 hover:bg-white/5 inline-flex items-center gap-1 cursor-pointer"
                  title={`Clear ${counts.done} completed operation${counts.done === 1 ? '' : 's'}`}
                >
                  <Trash2 className="w-2.5 h-2.5" />
                  Clear
                </button>
              )}
            </div>

            {/* Scrollable history: the record of what ran, stays until cleared. */}
            <div
              id="file-operations-list"
              className="border-t border-white/10 max-h-72 overflow-y-auto divide-y divide-white/5"
            >
              {ordered.length === 0 ? (
                <div className="px-3 py-4 text-center text-[11px] text-slate-500">
                  No {filter === 'all' ? '' : filter} operations
                </div>
              ) : (
                ordered.map((entry) =>
                  entry.source === 'item' ? (
                    <OperationRow
                      key={entry.id}
                      op={entry.op}
                      onRetry={() => retry(entry.id)}
                      onDismiss={() => dismiss(entry.id)}
                    />
                  ) : (
                    <JobRow
                      key={entry.id}
                      job={entry.job}
                      isScan={entry.isScan}
                      onCancel={onCancelJob}
                    />
                  ),
                )
              )}
            </div>

            <div className="px-3 py-1.5 border-t border-white/10 flex items-center gap-1.5 text-[10px] text-slate-500">
              <History className="w-2.5 h-2.5" />
              {entries.length === 0 ? 'Nothing has run yet' : 'Kept until cleared'}
            </div>

            {confirmClear && (
              <div
                className="px-3 py-2 border-t border-rose-500/30 bg-[#1b1116] space-y-2"
                role="alertdialog"
                aria-label="Confirm clearing completed operations"
              >
                <p className="text-[11px] text-slate-200">
                  Clear {counts.done} completed operation{counts.done === 1 ? '' : 's'}? Failures are
                  kept, but the record of what succeeded will be gone.
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      clearFinished();
                      setConfirmClear(false);
                    }}
                    className="px-2 py-0.5 rounded bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-[10px] font-semibold cursor-pointer"
                  >
                    Clear completed
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmClear(false)}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-slate-300 cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/**
 * A bulk job in the history list.
 *
 * These used to be visible only while running: the ribbon strip dropped them the
 * moment they finished, so a completed scan or scrape left no trace anywhere. They
 * are kept here with their final counts, which is the whole reason to have a history.
 */
const JobRow: React.FC<{
  job: BatchJob | SourceScanJob;
  isScan: boolean;
  onCancel?: (jobId: string) => void;
}> = ({ job, isScan, onCancel }) => {
  const status = jobStatusToLog(job.status);
  const meta = STATUS_META[status === 'done' ? 'done' : status === 'failed' ? 'error' : status];
  const batch = isScan ? null : (job as BatchJob);
  const scan = isScan ? (job as SourceScanJob) : null;
  const percent = scan ? scan.overallPercent : (batch?.overallPercent ?? 0);
  const label = scan ? `Scan ${scan.sourceName}` : (batch?.label ?? 'Job');

  return (
    <div className="px-3 py-1.5 space-y-1">
      <div className="flex items-center gap-1.5">
        {meta.icon}
        <span className="text-[11px] font-semibold text-slate-100 flex-1 truncate" title={label}>
          {label}
        </span>
        <span className={`px-1 py-0 rounded border text-[9px] font-bold uppercase ${meta.badge}`}>
          {meta.label}
        </span>
        {status === 'running' && onCancel && (
          <button
            type="button"
            onClick={() => onCancel(job.jobId)}
            className="px-1 py-0 rounded text-[9px] text-rose-300 hover:bg-rose-500/20 border border-rose-500/40 cursor-pointer"
            title="Cancel this job"
          >
            Cancel
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1 rounded-full bg-slate-800 overflow-hidden">
          <div
            className={`h-full ${status === 'failed' ? 'bg-rose-500' : status === 'done' ? 'bg-emerald-500' : 'bg-sky-500'}`}
            style={{ width: `${Math.max(3, percent)}%` }}
          />
        </div>
        <span className="font-mono text-[9px] text-slate-400 shrink-0">{percent}%</span>
      </div>
      <div className="text-[9px] text-slate-500 truncate">
        {scan
          ? `${scan.itemsProcessed}/${scan.itemsTotal} items · ${scan.moviesScanned} films, ${scan.showsScanned} shows`
          : batch
            ? `${batch.processedCount}/${batch.totalCount} · ${batch.succeededCount} ok${
                batch.skippedCount ? `, ${batch.skippedCount} skipped` : ''
              }${batch.failedCount ? `, ${batch.failedCount} failed` : ''}`
            : ''}
        {batch?.detail ? ` · ${batch.detail}` : ''}
      </div>
    </div>
  );
};

const OperationRow: React.FC<{
  op: FileOperation;
  onRetry: () => void;
  onDismiss: () => void;
}> = ({ op, onRetry, onDismiss }) => {
  const meta = STATUS_META[op.status];
  return (
    <div className="px-3 py-1.5 flex items-start gap-2">
      <span className="mt-0.5">{meta.icon}</span>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-[11px] text-slate-200 truncate flex-1">{op.label}</span>
          <span
            className={`px-1 py-0 rounded border text-[9px] font-bold uppercase shrink-0 ${meta.badge}`}
          >
            {meta.label}
          </span>
        </div>
        <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
          {op.finishedAt ? (
            <span title={new Date(op.finishedAt).toLocaleString()}>{formatTime(op.finishedAt)}</span>
          ) : (
            <span title={new Date(op.queuedAt).toLocaleString()}>
              queued {formatTime(op.queuedAt)}
            </span>
          )}
          {op.restored && <span className="text-amber-300/80">resumed</span>}
        </div>
        {op.status === 'queued' && <div className="text-[10px] text-slate-500">Waiting…</div>}
        {op.detail && <div className="text-[10px] text-slate-400 truncate">{op.detail}</div>}
        {op.error && (
          <div className="text-[10px] text-rose-300 break-words whitespace-normal">{op.error}</div>
        )}
      </div>

      {op.status === 'error' && (
        <button
          onClick={onRetry}
          title="Retry"
          className="p-0.5 rounded text-slate-400 hover:text-sky-300 hover:bg-white/5 shrink-0 cursor-pointer"
        >
          <RotateCw className="w-3 h-3" />
        </button>
      )}
      {op.status !== 'running' && (
        <button
          onClick={onDismiss}
          title="Dismiss"
          className="p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 shrink-0 cursor-pointer"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
};
