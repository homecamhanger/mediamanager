/**
 * A determinate progress bar.
 *
 * Every long operation in the app reports how far along it actually is, so this renders
 * a real fraction rather than an indeterminate spinner. `phase` is the important part:
 * when a bar sits still, the label still tells you what it is chewing on.
 */

export interface ProgressBarProps {
  /** What is happening now, e.g. "Checking episode guides (25/60 series)". */
  phase: string;
  /** 0–100. Clamped, because callers compute it in several places. */
  percent: number;
  /** Optional counts, shown as "3 of 7". */
  completed?: number;
  total?: number;
  /** Cancels the work; omitted when the operation cannot be stopped. */
  onCancel?: () => void;
  cancelLabel?: string;
}

export function ProgressBar({
  phase,
  percent,
  completed,
  total,
  onCancel,
  cancelLabel = 'Cancel',
}: ProgressBarProps) {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3" role="status" aria-live="polite">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate text-slate-200">{phase}</span>
        <span className="shrink-0 tabular-nums text-slate-400">
          {typeof completed === 'number' && typeof total === 'number' && total > 0
            ? `${completed}/${total} · `
            : ''}
          {clamped}%
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-valuenow={clamped}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={phase}
      >
        <div
          className="h-full rounded-full bg-sky-500 transition-[width] duration-300 ease-out"
          style={{ width: `${clamped}%` }}
        />
      </div>
      {onCancel && (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="rounded border border-slate-700 px-2 py-1 text-xs text-slate-300 hover:bg-slate-800"
          >
            {cancelLabel}
          </button>
        </div>
      )}
    </div>
  );
}
