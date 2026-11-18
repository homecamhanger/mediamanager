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

export const FileOperationsPanel: React.FC = () => {
  const { ops, activeCount, dismiss, retry, clearFinished } = useFileOperations();
  const [expanded, setExpanded] = useState(true);
  const [filter, setFilter] = useState<'all' | 'active' | 'failed' | 'done'>('all');

  const counts = useMemo(
    () => ({
      queued: ops.filter((o) => o.status === 'queued').length,
      running: ops.filter((o) => o.status === 'running').length,
      done: ops.filter((o) => o.status === 'done').length,
      error: ops.filter((o) => o.status === 'error').length,
    }),
    [ops],
  );

  // Nothing has ever been queued: render nothing at all rather than an empty launcher.
  if (ops.length === 0) return null;

  const visible =
    filter === 'all'
      ? ops
      : filter === 'active'
        ? ops.filter((o) => o.status === 'queued' || o.status === 'running')
        : ops.filter((o) => o.status === filter);

  // Newest first: queued/running float to the top because that is what needs attention,
  // then everything else by recency.
  const ordered = [
    ...visible.filter((o) => o.status === 'running'),
    ...visible.filter((o) => o.status === 'queued'),
    ...visible
      .filter((o) => o.status === 'done' || o.status === 'error')
      .sort((a, b) => (b.finishedAt ?? b.queuedAt) - (a.finishedAt ?? a.queuedAt)),
  ];

  const headline =
    activeCount > 0
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
                  onClick={clearFinished}
                  className="ml-auto px-1.5 py-0.5 rounded text-[10px] text-slate-400 hover:text-slate-100 hover:bg-white/5 inline-flex items-center gap-1 cursor-pointer"
                  title="Clear completed operations"
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
                ordered.map((op) => (
                  <OperationRow
                    key={op.id}
                    op={op}
                    onRetry={() => retry(op.id)}
                    onDismiss={() => dismiss(op.id)}
                  />
                ))
              )}
            </div>

            <div className="px-3 py-1.5 border-t border-white/10 flex items-center gap-1.5 text-[10px] text-slate-500">
              <History className="w-2.5 h-2.5" />
              Kept until cleared
            </div>
          </>
        )}
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
