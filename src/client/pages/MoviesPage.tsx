import React, { useMemo, useState } from 'react';
import {
  CheckSquare,
  Eye,
  FileCode2,
  Grid3x3,
  Languages,
  List,
  Search,
  Sparkles,
  Square,
  Subtitles,
} from 'lucide-react';
import type { MovieRecord } from '../../shared/types.js';
import { MovieDetailModal } from '../components/MovieDetailModal.js';
import { PosterImage } from '../components/PosterImage.js';
import { CompletenessPills, TechBadges } from '../components/QualityBadges.js';
import { RatingBadges } from '../components/RatingBadges.js';
import { ScrapeModal } from '../components/ScrapeModal.js';
import { SubtitleSearchModal } from '../components/SubtitleSearchModal.js';
import { api } from '../lib/api.js';

type FilterPreset = 'all' | 'unscraped' | 'missing_nfo' | 'missing_art' | 'missing_subs' | 'watched' | 'unwatched' | '4k';

export const MoviesPage: React.FC<{
  movies: MovieRecord[];
  onRefresh: () => void;
}> = ({ movies, onRefresh }) => {
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<FilterPreset>('all');
  const [genreFilter, setGenreFilter] = useState('');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [detailMovieId, setDetailMovieId] = useState<number | null>(null);
  const [scrapeTarget, setScrapeTarget] = useState<MovieRecord | null>(null);
  const [subTarget, setSubTarget] = useState<MovieRecord | null>(null);
  const [batchBusy, setBatchBusy] = useState<string | null>(null);

  const allGenres = useMemo(() => {
    const s = new Set<string>();
    movies.forEach((m) => m.genres.forEach((g) => s.add(g)));
    return [...s].sort();
  }, [movies]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return movies.filter((m) => {
      if (q) {
        const hay = `${m.title} ${m.originalTitle} ${m.year ?? ''} ${m.setName ?? ''} ${m.directors.join(' ')} ${m.fileName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (genreFilter && !m.genres.includes(genreFilter)) return false;
      if (filter === 'unscraped' && m.scraped) return false;
      if (filter === 'missing_nfo' && m.hasNfo) return false;
      if (filter === 'missing_art' && m.artwork.poster && m.artwork.fanart && m.artwork.clearlogo) return false;
      if (filter === 'missing_subs' && m.subtitles.length > 0) return false;
      if (filter === 'watched' && !m.watched) return false;
      if (filter === 'unwatched' && m.watched) return false;
      if (filter === '4k' && m.parsedInfo.resolution !== '2160p' && (m.streamDetails.video[0]?.height ?? 0) < 2000) return false;
      return true;
    });
  }, [movies, search, filter, genreFilter]);

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filtered.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filtered.map((m) => m.id)));
    }
  };

  const runBatch = async (kind: 'scrape' | 'nfo' | 'subs' | 'watched' | 'unwatched') => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBatchBusy(kind);
    try {
      if (kind === 'scrape') await api.batchScrape({ movieIds: ids });
      else if (kind === 'nfo') await api.batchMovies('writeNfo', ids);
      else if (kind === 'watched') await api.batchMovies('markWatched', ids);
      else if (kind === 'unwatched') await api.batchMovies('markUnwatched', ids);
      else if (kind === 'subs') await api.batchMissingSubtitles({ movieIds: ids });
      onRefresh();
    } finally {
      setBatchBusy(null);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Movies ({filtered.length})</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Click any movie to edit Kodi metadata, artwork, subtitles, or raw NFO XML.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter title, director, set, file..."
              className="w-64 bg-[#111827] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100"
            />
          </div>
          <select
            value={genreFilter}
            onChange={(e) => setGenreFilter(e.target.value)}
            className="bg-[#111827] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
          >
            <option value="">All Genres</option>
            {allGenres.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
          <div className="flex rounded-xl bg-[#111827] border border-slate-800 p-0.5">
            <button
              onClick={() => setViewMode('grid')}
              className={`p-1.5 rounded-lg cursor-pointer ${viewMode === 'grid' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'}`}
              title="Poster Grid View"
            >
              <Grid3x3 className="w-4 h-4" />
            </button>
            <button
              onClick={() => setViewMode('table')}
              className={`p-1.5 rounded-lg cursor-pointer ${viewMode === 'table' ? 'bg-sky-500/20 text-sky-300' : 'text-slate-400'}`}
              title="Power Table View"
            >
              <List className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Filter Pills */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { id: 'all', label: 'All' },
            { id: 'unscraped', label: 'Unscraped' },
            { id: 'missing_nfo', label: 'Missing NFO' },
            { id: 'missing_art', label: 'Incomplete Art' },
            { id: 'missing_subs', label: 'No Subtitles' },
            { id: '4k', label: '4K UHD' },
            { id: 'unwatched', label: 'Unwatched' },
            { id: 'watched', label: 'Watched' },
          ].map((p) => (
            <button
              key={p.id}
              onClick={() => setFilter(p.id as FilterPreset)}
              className={`px-3 py-1 rounded-lg text-xs font-semibold border cursor-pointer transition ${
                filter === p.id
                  ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                  : 'bg-[#111827] border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <button
          onClick={toggleSelectAll}
          className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1.5 cursor-pointer"
        >
          {selectedIds.size === filtered.length && filtered.length > 0 ? (
            <CheckSquare className="w-4 h-4 text-sky-400" />
          ) : (
            <Square className="w-4 h-4" />
          )}
          {selectedIds.size > 0 ? `${selectedIds.size} selected` : 'Select All'}
        </button>
      </div>

      {/* Batch Toolbar */}
      {selectedIds.size > 0 && (
        <div className="p-3 rounded-xl bg-sky-500/10 border border-sky-500/30 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs font-semibold text-sky-200">{selectedIds.size} movies selected</span>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={Boolean(batchBusy)}
              onClick={() => runBatch('scrape')}
              className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> {batchBusy === 'scrape' ? 'Scraping...' : 'Auto-Scrape'}
            </button>
            <button
              disabled={Boolean(batchBusy)}
              onClick={() => runBatch('nfo')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <FileCode2 className="w-3.5 h-3.5 text-emerald-400" /> Write NFOs
            </button>
            <button
              disabled={Boolean(batchBusy)}
              onClick={() => runBatch('subs')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Languages className="w-3.5 h-3.5 text-sky-400" /> Fetch Subtitles
            </button>
            <button
              disabled={Boolean(batchBusy)}
              onClick={() => runBatch('watched')}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Eye className="w-3.5 h-3.5" /> Mark Watched
            </button>
          </div>
        </div>
      )}

      {/* Grid or Table */}
      {viewMode === 'grid' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {filtered.map((m) => {
            const selected = selectedIds.has(m.id);
            return (
              <div
                key={m.id}
                className={`group rounded-2xl bg-[#111827] border overflow-hidden transition flex flex-col ${
                  selected ? 'border-sky-400 ring-1 ring-sky-400/50' : 'border-slate-800 hover:border-slate-600'
                }`}
              >
                <div className="relative cursor-pointer" onClick={() => setDetailMovieId(m.id)}>
                  <PosterImage filePath={m.artwork.poster} alt={m.title} className="rounded-none w-full" cacheKey={m.updatedAt} />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSelect(m.id);
                    }}
                    className={`absolute top-2 left-2 p-1 rounded-md backdrop-blur-md transition cursor-pointer ${
                      selected ? 'bg-sky-500 text-white' : 'bg-black/60 text-slate-300 opacity-0 group-hover:opacity-100'
                    }`}
                  >
                    {selected ? <CheckSquare className="w-4 h-4" /> : <Square className="w-4 h-4" />}
                  </button>
                  {!m.scraped && (
                    <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-amber-500/90 text-slate-950 text-[10px] font-extrabold">
                      UNSCRAPED
                    </span>
                  )}
                  <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/90 via-black/50 to-transparent flex items-center justify-between gap-1 opacity-0 group-hover:opacity-100 transition">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setScrapeTarget(m);
                      }}
                      className="px-2 py-1 rounded bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Sparkles className="w-3 h-3" /> Scrape
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setSubTarget(m);
                      }}
                      className="px-2 py-1 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-100 text-[10px] font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Subtitles className="w-3 h-3" /> Subs
                    </button>
                  </div>
                </div>
                <div className="p-3 space-y-2 flex-1 flex flex-col justify-between cursor-pointer" onClick={() => setDetailMovieId(m.id)}>
                  <div>
                    <div className="font-bold text-sm text-slate-100 truncate">{m.title}</div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between mt-0.5">
                      <span>{m.year ?? 'Year?'}</span>
                      {m.setName && <span className="text-amber-300/90 truncate max-w-[115px]">{m.setName}</span>}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <RatingBadges ratings={m.ratings} compact />
                    <TechBadges parsed={m.parsedInfo} streamDetails={m.streamDetails} />
                    <CompletenessPills
                      hasNfo={m.hasNfo}
                      hasPoster={Boolean(m.artwork.poster)}
                      hasFanart={Boolean(m.artwork.fanart)}
                      subtitles={m.subtitles}
                      watched={m.watched}
                    />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-2xl bg-[#111827] border border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3 w-8"></th>
                <th className="p-3">Movie</th>
                <th className="p-3">Year</th>
                <th className="p-3">Ratings</th>
                <th className="p-3">Quality</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-900/50">
                  <td className="p-3">
                    <button onClick={() => toggleSelect(m.id)} className="cursor-pointer text-slate-400">
                      {selectedIds.has(m.id) ? <CheckSquare className="w-4 h-4 text-sky-400" /> : <Square className="w-4 h-4" />}
                    </button>
                  </td>
                  <td className="p-3 cursor-pointer" onClick={() => setDetailMovieId(m.id)}>
                    <div className="font-bold text-slate-100">{m.title}</div>
                    <div className="text-[11px] text-slate-500 font-mono truncate max-w-xs">{m.fileName}</div>
                  </td>
                  <td className="p-3 text-slate-300">{m.year ?? '—'}</td>
                  <td className="p-3">
                    <RatingBadges ratings={m.ratings} compact />
                  </td>
                  <td className="p-3">
                    <TechBadges parsed={m.parsedInfo} streamDetails={m.streamDetails} />
                  </td>
                  <td className="p-3">
                    <CompletenessPills
                      hasNfo={m.hasNfo}
                      hasPoster={Boolean(m.artwork.poster)}
                      subtitles={m.subtitles}
                      watched={m.watched}
                    />
                  </td>
                  <td className="p-3 text-right space-x-1.5 whitespace-nowrap">
                    <button
                      onClick={() => setScrapeTarget(m)}
                      className="px-2 py-1 rounded bg-sky-500/20 text-sky-300 font-semibold cursor-pointer"
                    >
                      Scrape
                    </button>
                    <button
                      onClick={() => setSubTarget(m)}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 cursor-pointer"
                    >
                      Subs
                    </button>
                    <button
                      onClick={() => setDetailMovieId(m.id)}
                      className="px-2 py-1 rounded bg-slate-800 text-slate-300 cursor-pointer"
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <MovieDetailModal movieId={detailMovieId} onUpdated={onRefresh} onClose={() => setDetailMovieId(null)} />

      {scrapeTarget && (
        <ScrapeModal
          open={Boolean(scrapeTarget)}
          mediaKind="movie"
          mediaId={scrapeTarget.id}
          initialQuery={scrapeTarget.parsedInfo.cleanTitle || scrapeTarget.title}
          initialYear={scrapeTarget.year ?? scrapeTarget.parsedInfo.year}
          onApplied={onRefresh}
          onClose={() => setScrapeTarget(null)}
        />
      )}

      {subTarget && (
        <SubtitleSearchModal
          open={Boolean(subTarget)}
          mediaType="movie"
          mediaId={subTarget.id}
          mediaTitle={`${subTarget.title}${subTarget.year ? ` (${subTarget.year})` : ''}`}
          onDownloaded={onRefresh}
          onClose={() => setSubTarget(null)}
        />
      )}
    </div>
  );
};
