import React from 'react';
import { X } from 'lucide-react';

/**
 * Shared inspector header used by the Movie / TV Show / Episode detail panels.
 *
 * The layout is deliberately not a `justify-between` row:
 *  - the title block is `flex-1 basis-64`, so it claims every pixel the
 *    actions don't need and only gives width back when it is genuinely out of
 *    room (a long title wraps to two lines instead of truncating early);
 *  - when the pane is too narrow for title + buttons, the action cluster wraps
 *    onto its own full-width, right-aligned row rather than squatting in the
 *    middle of the header;
 *  - rating / codec / status chips are a separate full-width row underneath the
 *    title, aligned with it, so they never collapse into a skinny column beside
 *    the buttons.
 *
 * It also uses container queries (`@container`), so it responds to the width of
 * the inspector pane — not the browser window, which is what previously made the
 * header break in a split view.
 */
export const DetailHero: React.FC<{
  fanartUrl?: string | null;
  onClose?: () => void;
  breadcrumb?: React.ReactNode;
  leading?: React.ReactNode;
  titleArea: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  toast?: string | null;
}> = ({ fanartUrl, onClose, breadcrumb, leading, titleArea, meta, actions, tabs, toast }) => (
  <div className="relative border-b border-slate-800 shrink-0 @container">
    {fanartUrl && (
      <div className="absolute inset-0 bg-cover bg-center opacity-25" style={{ backgroundImage: `url("${fanartUrl}")` }} />
    )}
    <div className="relative bg-gradient-to-r from-[#0b0f17]/95 via-[#0f1522]/90 to-[#0f1522]/85">
      {onClose && (
        <button
          onClick={onClose}
          aria-label="Close"
          title="Close (Esc)"
          className="absolute top-2.5 right-3 z-20 p-1.5 rounded-lg text-slate-300 bg-slate-900/75 hover:bg-slate-800 hover:text-white border border-slate-700/70 cursor-pointer transition"
        >
          <X className="w-4 h-4" />
        </button>
      )}

      {breadcrumb && (
        <div className={`px-4 @xl:px-5 pt-2.5 flex items-center gap-2 flex-wrap text-[11px] text-slate-400 ${onClose ? 'pr-14' : ''}`}>
          {breadcrumb}
        </div>
      )}

      <div className={`px-4 @xl:px-5 py-3 ${onClose ? 'pr-14' : ''}`}>
        <div className="flex items-center gap-x-4">
          {leading && <div className="flex items-center gap-3 shrink-0">{leading}</div>}

          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Title claims all remaining width; the action cluster either sits beside
                it or wraps onto its own right-aligned row instead of stealing space. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1 basis-64">{titleArea}</div>
              {actions && <div className="ml-auto flex flex-wrap justify-end items-center gap-1.5 max-w-full">{actions}</div>}
            </div>

            {meta && (
              <div className="min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-400">{meta}</div>
            )}
          </div>
        </div>
      </div>

      {tabs && (
        <div className="relative px-4 @xl:px-5 bg-[#0b0f17]/85 flex items-center gap-1 overflow-x-auto border-t border-slate-800/80">
          {tabs}
          {toast && (
            <span className="ml-auto shrink-0 whitespace-nowrap text-xs text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-md">
              {toast}
            </span>
          )}
        </div>
      )}
    </div>
  </div>
);

export const HeroTab: React.FC<{
  active: boolean;
  icon: React.ReactNode;
  label: React.ReactNode;
  onClick: () => void;
}> = ({ active, icon, label, onClick }) => (
  <button
    onClick={onClick}
    className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
      active ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-400 hover:text-slate-200'
    }`}
  >
    {icon}
    {label}
  </button>
);

/**
 * Title element that uses all available width, wraps to two lines when needed,
 * and never truncates with vertical space still available.
 */
export const HeroTitle: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <h2
    className={`text-lg leading-snug font-bold text-white break-words line-clamp-2 [overflow-wrap:anywhere] ${className}`}
  >
    {children}
  </h2>
);

/** Small inline chip that flows with the title text instead of competing for width. */
export const HeroChip: React.FC<{ children: React.ReactNode; tone?: 'slate' | 'amber' | 'sky' | 'indigo' }> = ({
  children,
  tone = 'slate',
}) => {
  const tones: Record<string, string> = {
    slate: 'bg-slate-800 border-slate-700 text-slate-300',
    amber: 'bg-amber-500/15 border-amber-500/30 text-amber-300',
    sky: 'bg-sky-500/20 border-sky-500/40 text-sky-300',
    indigo: 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300',
  };
  return (
    <span
      className={`inline-block align-middle ml-1.5 whitespace-nowrap px-1.5 py-0.5 rounded border text-[11px] font-semibold ${tones[tone]}`}
    >
      {children}
    </span>
  );
};
