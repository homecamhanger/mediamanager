import React, { useState } from 'react';
import { Filter, Users } from 'lucide-react';
import type { ActorEntry } from '../../shared/types.js';
import { getArtworkUrl } from '../lib/api.js';

interface CastListColumnProps {
  actors: ActorEntry[];
  label?: string;
  emptyText?: string;
  activeActor?: string | null;
  onSelectActor?: (actorName: string) => void;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const CastListColumn: React.FC<CastListColumnProps> = ({
  actors,
  label = 'Cast',
  emptyText = 'No cast scraped yet. Click “Scrape” to populate cast & crew.',
  activeActor = null,
  onSelectActor,
}) => {
  const activeNorm = activeActor?.trim().toLowerCase() || '';
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-sky-400" /> {label} ({actors.length})
        </div>
        {onSelectActor && actors.length > 0 && (
          <div className="text-[11px] text-slate-400">
            Click a cast member to filter across Movies, TV Shows, and Sets
          </div>
        )}
      </div>

      {actors.length === 0 ? (
        <div className="text-xs text-slate-500 bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center">
          {emptyText}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {actors.map((a, idx) => {
            const isActive = Boolean(activeNorm && a.name.trim().toLowerCase() === activeNorm);
            const thumbUrl = a.thumb ? getArtworkUrl(a.thumb) : null;
            const showImg = Boolean(thumbUrl && !failedThumbs.has(thumbUrl));

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
                className={`group w-full text-left p-2.5 rounded-xl border flex items-center gap-3 transition ${
                  isActive
                    ? 'bg-sky-500/20 border-sky-500/60 text-white shadow-sm shadow-sky-500/10'
                    : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 hover:border-sky-500/40'
                } ${onSelectActor ? 'cursor-pointer' : ''}`}
              >
                <div
                  className={`w-10 h-10 rounded-full shrink-0 overflow-hidden border flex items-center justify-center text-xs font-bold ${
                    isActive
                      ? 'border-sky-400/70 bg-sky-500/30 text-sky-100'
                      : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  {showImg && thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={a.name}
                      loading="lazy"
                      onError={() => setFailedThumbs((prev) => new Set([...prev, thumbUrl]))}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{getInitials(a.name)}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className={`text-xs font-bold truncate ${
                      isActive ? 'text-sky-100' : 'text-slate-100 group-hover:text-sky-200'
                    }`}
                  >
                    {a.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {a.role ? `as ${a.role}` : 'Cast'}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-mono text-slate-500">#{a.order + 1}</span>
                  {onSelectActor && (
                    <Filter
                      className={`w-3 h-3 transition ${
                        isActive ? 'text-sky-300 opacity-100' : 'text-sky-400 opacity-0 group-hover:opacity-100'
                      }`}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
