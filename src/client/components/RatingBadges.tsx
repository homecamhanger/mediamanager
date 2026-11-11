import React from 'react';
import type { RatingEntry } from '../../shared/types.js';

const BADGE_STYLE: Record<string, { label: string; cls: string }> = {
  imdb: { label: 'IMDb', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  tmdb: { label: 'TMDb', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  rottentomatoes: { label: 'RT', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/30' },
  metacritic: { label: 'MC', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  trakt: { label: 'Trakt', cls: 'bg-pink-500/15 text-pink-300 border-pink-500/30' },
  mal: { label: 'MAL', cls: 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30' },
  tvdb: { label: 'TVDB', cls: 'bg-teal-500/15 text-teal-300 border-teal-500/30' },
  tvmaze: { label: 'TVmaze', cls: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30' },
};

export const RatingBadges: React.FC<{ ratings: RatingEntry[]; compact?: boolean }> = ({ ratings, compact = false }) => {
  if (!ratings || ratings.length === 0) {
    return <span className="text-[11px] text-slate-500 italic">No ratings</span>;
  }
  const items = compact ? ratings.slice(0, 3) : ratings;
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((r) => {
        const meta = BADGE_STYLE[r.source.toLowerCase()] ?? {
          label: r.source.toUpperCase(),
          cls: 'bg-slate-800 text-slate-300 border-slate-700',
        };
        const formatted = r.max === 100 ? `${Math.round(r.value)}%` : r.value.toFixed(1);
        return (
          <span
            key={r.source}
            title={r.votes ? `${meta.label}: ${formatted} (${r.votes.toLocaleString()} votes)` : `${meta.label}: ${formatted}`}
            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-semibold ${meta.cls}`}
          >
            <span className="opacity-75">{meta.label}</span>
            <span>{formatted}</span>
          </span>
        );
      })}
    </div>
  );
};
