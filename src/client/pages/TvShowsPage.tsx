import React, { useState } from 'react';
import { FileCode2, Search, Sparkles, Subtitles } from 'lucide-react';
import type { TvShowRecord } from '../../shared/types.js';
import { PosterImage } from '../components/PosterImage.js';
import { RatingBadges } from '../components/RatingBadges.js';
import { ScrapeModal } from '../components/ScrapeModal.js';
import { TvShowDetailModal } from '../components/TvShowDetailModal.js';

export const TvShowsPage: React.FC<{
  shows: TvShowRecord[];
  onRefresh: () => void;
}> = ({ shows, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [detailShowId, setDetailShowId] = useState<number | null>(null);
  const [scrapeShow, setScrapeShow] = useState<TvShowRecord | null>(null);

  const filtered = shows.filter((s) =>
    `${s.title} ${s.year ?? ''} ${s.studio}`.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">TV Shows ({filtered.length})</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Manage series, seasons, episode guides, episode thumbnails, NFOs, and per-episode subtitles.
          </p>
        </div>
        <div className="relative">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter series..."
            className="w-64 bg-[#111827] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filtered.map((s) => (
          <div
            key={s.id}
            onClick={() => setDetailShowId(s.id)}
            className="rounded-2xl bg-[#111827] border border-slate-800 hover:border-sky-500/40 overflow-hidden cursor-pointer transition flex flex-col"
          >
            <div className="relative h-36 bg-slate-900 overflow-hidden">
              <PosterImage filePath={s.artwork.fanart || s.artwork.banner} alt={s.title} aspect="fanart" className="w-full h-full rounded-none opacity-65" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#111827] via-[#111827]/40 to-transparent" />
              {!s.scraped && (
                <span className="absolute top-3 right-3 px-2 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-extrabold">
                  UNSCRAPED
                </span>
              )}
              <div className="absolute bottom-3 left-4 right-4 flex items-end gap-3">
                <div className="w-16 shrink-0 shadow-xl">
                  <PosterImage filePath={s.artwork.poster} alt={s.title} />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-white truncate">{s.title}</h3>
                  <div className="text-xs text-slate-300 flex items-center gap-2">
                    <span>{s.year ?? '—'}</span>
                    <span>•</span>
                    <span>{s.status}</span>
                    {s.studio && (
                      <>
                        <span>•</span>
                        <span className="truncate">{s.studio}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3 flex-1 flex flex-col justify-between">
              <div className="space-y-2">
                <RatingBadges ratings={s.ratings} compact />
                <p className="text-xs text-slate-400 line-clamp-2">{s.plot || 'No show synopsis yet. Scrape to populate series and episode metadata.'}</p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                <div className="flex items-center gap-3">
                  <span>{s.seasonsCount} Seasons / {s.episodesCount} Eps</span>
                  <span className={`inline-flex items-center gap-1 ${s.missingNfoCount === 0 && s.hasNfo ? 'text-emerald-400' : 'text-amber-400'}`}>
                    <FileCode2 className="w-3 h-3" /> {s.hasNfo ? `${s.episodesCount - s.missingNfoCount}/${s.episodesCount} NFO` : 'No NFO'}
                  </span>
                  <span className={`inline-flex items-center gap-1 ${s.missingSubtitlesCount === 0 ? 'text-sky-400' : 'text-slate-400'}`}>
                    <Subtitles className="w-3 h-3" /> {s.episodesCount - s.missingSubtitlesCount}/{s.episodesCount} Subs
                  </span>
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setScrapeShow(s);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 text-sky-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" /> Scrape
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      <TvShowDetailModal showId={detailShowId} onUpdated={onRefresh} onClose={() => setDetailShowId(null)} />

      {scrapeShow && (
        <ScrapeModal
          open={Boolean(scrapeShow)}
          mediaKind="tvshow"
          mediaId={scrapeShow.id}
          initialQuery={scrapeShow.title}
          initialYear={scrapeShow.year}
          onApplied={onRefresh}
          onClose={() => setScrapeShow(null)}
        />
      )}
    </div>
  );
};
