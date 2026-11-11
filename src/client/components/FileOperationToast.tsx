import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronUp, Loader2, RotateCw, X } from 'lucide-react';
import { useFileOperations } from '../lib/useFileOperations.js';

/**
 * Floating queue for background file operations (NFO writes, artwork, scrapes).
 *
 * Replaces the old pattern of leaving a modal open on a spinner while a network
 * drive spun up. Collapsed it is a single pill showing what is in flight; expanded
 * it lists each operation with its outcome. Failures stay until dismissed and can
 * be retried — previously they were lost when the dialog closed.
 */
export const FileOperationToast: React.FC = () => {
  const { ops, activeCount, dismiss, retry, clearFinished } = useFileOperations();
  const [expanded, setExpanded] = useState(false);

  if (ops.length === 0) return null;

  const errors = ops.filter((o) => o.status === 'error');
  const done = ops.filter((o) => o.status === 'done');
  const running = ops.filter((o) => o.status === 'running');
  const queued = ops.filter((o) => o.status === 'queued');

  const headline =
    activeCount > 0
      ? `${activeCount} file operation${activeCount === 1 ? '' : 's'} in progress`
      : errors.length > 0
        ? `${errors.length} file operation${errors.length === 1 ? '' : 's'} failed`
        : `${done.length} file operation${done.length === 1 ? '' : 's'} complete`;

  // Failures take visual priority over in-flight work.
  const tone =
    errors.length > 0
      ? 'bg-[#1b1116] border-rose-500/40'
      : activeCount > 0
        ? 'bg-[#0b1420] border-sky-500/40'
        : 'bg-[#0b1712] border-emerald-500/40';
  const accent = errors.length > 0 ? 'text-rose-300' : activeCount > 0 ? 'text-sky-300' : 'text-emerald-300';

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-[22rem] max-w-[calc(100vw-2rem)]">
      <div className={`rounded-xl border shadow-2xl backdrop-blur-sm overflow-hidden ${tone}`}>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="w-full px-3 py-2 flex items-center gap-2 cursor-pointer text-left"
          aria-expanded={expanded}
        >
          {activeCount > 0 ? (
            <Loader2 className="w-3.5 h-3.5 shrink-0 animate-spin text-sky-400" />
          ) : errors.length > 0 ? (
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-400" />
          ) : (
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
          )}
          <span className={`text-[11px] font-bold flex-1 truncate ${accent}`}>{headline}</span>
          {expanded ? (
            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          )}
        </button>

        {expanded && (
          <div className="border-t border-white/10 max-h-64 overflow-y-auto divide-y divide-white/5">
            {[...running, ...queued, ...errors, ...done].map((op) => (
              <div key={op.id} className="px-3 py-1.5 flex items-start gap-2">
                {op.status === 'running' ? (
                  <Loader2 className="w-3 h-3 mt-0.5 shrink-0 animate-spin text-sky-400" />
                ) : op.status === 'queued' ? (
                  <Loader2 className="w-3 h-3 mt-0.5 shrink-0 text-slate-500" />
                ) : op.status === 'done' ? (
                  <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-3 h-3 mt-0.5 shrink-0 text-rose-400" />
                )}

                <div className="min-w-0 flex-1">
                  <div className="text-[11px] text-slate-200 truncate">{op.label}</div>
                  {op.status === 'queued' && <div className="text-[10px] text-slate-500">Waiting…</div>}
                  {op.detail && <div className="text-[10px] text-slate-500 truncate">{op.detail}</div>}
                  {op.error && (
                    <div className="text-[10px] text-rose-300 break-words whitespace-normal">{op.error}</div>
                  )}
                </div>

                {op.status === 'error' && (
                  <button
                    onClick={() => retry(op.id)}
                    title="Retry"
                    className="p-0.5 rounded text-slate-400 hover:text-sky-300 hover:bg-white/5 shrink-0 cursor-pointer"
                  >
                    <RotateCw className="w-3 h-3" />
                  </button>
                )}
                {op.status !== 'running' && (
                  <button
                    onClick={() => dismiss(op.id)}
                    title="Dismiss"
                    className="p-0.5 rounded text-slate-500 hover:text-slate-200 hover:bg-white/5 shrink-0 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
            {done.length > 0 && (
              <button
                onClick={clearFinished}
                className="w-full px-3 py-1.5 text-[10px] text-slate-400 hover:text-slate-200 hover:bg-white/5 cursor-pointer"
              >
                Clear completed
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
