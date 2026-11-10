import React from 'react';
import { Filter, Users } from 'lucide-react';
import type { ActorEntry } from '../../shared/types.js';

interface CastListColumnProps {
  actors: ActorEntry[];
  label?: string;
  emptyText?: string;
  activeActor?: string | null;
  onSelectActor?: (actorName: string) => void;
}

export const CastListColumn: React.FC<CastListColumnProps> = ({
  actors,
  label = 'Cast',
  emptyText = 'No cast scraped yet. Click “Scrape” to populate cast & crew.',
  activeActor = null,
  onSelectActor,
}) => {
  const activeNorm = activeActor?.trim().toLowerCase() || '';

  return (
    <div className="xl:col-span-4 space-y-2">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
        <Users className="w-3.5 h-3.5 text-sky-400" /> {label} ({actors.length})
      </div>
      <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
        {actors.length === 0 ? (
          <div className="text-xs text-slate-500 bg-slate-900/60 border border-slate-800 rounded-xl p-3">
            {emptyText}
          </div>
        ) : (
          actors.map((a, idx) => {
            const isActive = Boolean(activeNorm && a.name.trim().toLowerCase() === activeNorm);
            return (
              <button
                key={`${a.name}-${idx}`}
                type="button"
                onClick={() => onSelectActor?.(a.name)}
                disabled={!onSelectActor}
                title={
                  onSelectActor
                    ? isActive
                      ? `Filtered by ${a.name} (click to clear)`
                      : `Filter movies & TV shows by ${a.name}`
                    : undefined
                }
                className={`group w-full text-left px-2.5 py-1.5 rounded-lg border flex items-center justify-between gap-2 transition ${
                  isActive
                    ? 'bg-sky-500/20 border-sky-500/50 text-white shadow-sm'
                    : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 hover:border-sky-500/40'
                } ${onSelectActor ? 'cursor-pointer' : ''}`}
              >
                <div className="min-w-0">
                  <div className={`text-xs font-semibold truncate ${isActive ? 'text-sky-200' : 'text-slate-100 group-hover:text-sky-200'}`}>
                    {a.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate">{a.role || 'Actor'}</div>
                </div>
                <span className="flex items-center gap-1 text-[10px] text-slate-500 shrink-0">
                  {onSelectActor && (
                    <Filter
                      className={`w-3 h-3 transition ${
                        isActive ? 'text-sky-300 opacity-100' : 'text-sky-400 opacity-0 group-hover:opacity-100'
                      }`}
                    />
                  )}
                  <span>#{a.order + 1}</span>
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
};
