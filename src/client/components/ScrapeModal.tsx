import React, { useEffect, useState } from 'react';
import { CheckCircle2, Globe, Layers, Search, Sparkles, X } from 'lucide-react';
import type {
  ArtworkKind,
  ScrapedMetadataBundle,
  ScraperProviderId,
  ScraperSearchResult,
} from '../../shared/types.js';
import { api } from '../lib/api.js';
import { fileOperations } from '../lib/fileOperations.js';
import { useEscapeKey } from '../lib/useEscapeKey.js';
import { PosterImage } from './PosterImage.js';
import { RatingBadges } from './RatingBadges.js';

interface ScrapeModalProps {
  open: boolean;
  mediaKind: 'movie' | 'tvshow';
  mediaId: number;
  initialQuery: string;
  initialYear?: number | null;
  onApplied: () => void;
  onClose: () => void;
}

export const ScrapeModal: React.FC<ScrapeModalProps> = ({
  open,
  mediaKind,
  mediaId,
  initialQuery,
  initialYear,
  onApplied,
  onClose,
}) => {
  const [query, setQuery] = useState(initialQuery);
  const [year, setYear] = useState<string>(initialYear ? String(initialYear) : '');
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<ScraperSearchResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<ScraperSearchResult | null>(null);
  const [bundleLoading, setBundleLoading] = useState(false);
  const [bundle, setBundle] = useState<ScrapedMetadataBundle | null>(null);
  const [selectedArtwork, setSelectedArtwork] = useState<Partial<Record<ArtworkKind, string>>>({});
  const [error, setError] = useState<string | null>(null);

  const runSearch = async (qStr = query, yStr = year) => {
    setSearching(true);
    setError(null);
    setBundle(null);
    setSelectedResult(null);
    try {
      const parsedYear = yStr && /^\d{4}$/.test(yStr.trim()) ? Number(yStr.trim()) : null;
      const res = await api.searchScrapers(qStr, mediaKind, parsedYear);
      setResults(res.results);
      if (res.results[0]) {
        await selectCandidate(res.results[0]);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSearching(false);
    }
  };

  const selectCandidate = async (item: ScraperSearchResult) => {
    setSelectedResult(item);
    setBundleLoading(true);
    setError(null);
    try {
      const res = await api.fetchScraperBundle(item.externalId, item.provider, mediaKind);
      setBundle(res.bundle);
      const defaults: Partial<Record<ArtworkKind, string>> = {};
      for (const a of res.bundle.artwork) {
        if (!defaults[a.kind]) defaults[a.kind] = a.url;
      }
      setSelectedArtwork(defaults);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBundleLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setQuery(initialQuery);
      setYear(initialYear ? String(initialYear) : '');
      void runSearch(initialQuery, initialYear ? String(initialYear) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mediaId, mediaKind]);

  useEscapeKey(open, onClose);

  if (!open) return null;

  const handleApply = () => {
    if (!bundle) return;
    const applied = bundle;
    const artwork = selectedArtwork;

    // Close at once and let the write finish in the background — metadata, artwork
    // and NFO writes on a slow share should not hold the dialog open.
    setError(null);
    onClose();
    fileOperations.enqueue({
      label: `Scrape · ${applied.title}${applied.year ? ` (${applied.year})` : ''}`,
      task:
        mediaKind === 'movie'
          ? { kind: 'movieBundle', movieId: mediaId, bundle: applied, artwork }
          : { kind: 'showBundle', showId: mediaId, bundle: applied },
      onApplied,
    });
  };

  const artworkByKind = (kind: ArtworkKind) => bundle?.artwork.filter((a) => a.kind === kind) ?? [];

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl w-full max-w-5xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        <div className="relative pl-5 pr-14 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Multi-Source Scraper & Match Picker ({mediaKind === 'movie' ? 'Movie' : 'TV Show'})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Aggregates metadata, ratings (IMDb / TMDb / RT / Metacritic / Trakt), and Kodi artwork across configured sources.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            title="Close (Esc)"
            className="absolute top-3.5 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/50 flex flex-wrap gap-2">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && runSearch()}
              placeholder="Search title..."
              className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100"
            />
          </div>
          <input
            value={year}
            onChange={(e) => setYear(e.target.value)}
            placeholder="Year"
            className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100"
          />
          <button
            onClick={() => runSearch()}
            disabled={searching}
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
          >
            {searching ? 'Searching...' : 'Search Sources'}
          </button>
        </div>

        {error && <div className="mx-5 mt-3 text-xs text-rose-300 bg-rose-500/15 border border-rose-500/30 rounded-lg px-3 py-2">{error}</div>}

        <div className="flex-1 overflow-hidden grid grid-cols-1 md:grid-cols-12">
          {/* Left: Search Results */}
          <div className="md:col-span-5 border-r border-slate-800 overflow-y-auto p-4 space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Candidate Matches ({results.length})
            </div>
            {results.length === 0 ? (
              <div className="text-sm text-slate-500 py-8 text-center">
                {searching ? 'Querying scrapers...' : 'No matches found. Try editing the search title or year.'}
              </div>
            ) : (
              results.map((r) => {
                const active = selectedResult?.externalId === r.externalId && selectedResult?.provider === r.provider;
                return (
                  <button
                    key={`${r.provider}:${r.externalId}`}
                    onClick={() => selectCandidate(r)}
                    className={`w-full text-left p-2.5 rounded-xl border transition flex gap-3 cursor-pointer ${
                      active
                        ? 'bg-sky-500/15 border-sky-500/50'
                        : 'bg-slate-900/70 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="w-12 shrink-0">
                      <PosterImage filePath={r.posterUrl} alt={r.title} compact />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-slate-100 truncate">{r.title}</span>
                        <span className="text-xs text-slate-400 shrink-0">{r.year ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 text-[10px] font-bold uppercase">
                          {r.provider}
                        </span>
                        <span className="text-[10px] text-emerald-400 font-semibold">
                          {Math.round(r.confidence * 100)}% match
                        </span>
                        <span className="text-[10px] text-slate-500 flex items-center gap-0.5">
                          <Globe className="w-2.5 h-2.5" />
                          {r.dataOrigin === 'live-api' ? 'Live' : 'Catalog'}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">{r.overview}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>

          {/* Right: Merged Bundle Preview + Artwork Picker */}
          <div className="md:col-span-7 overflow-y-auto p-5 space-y-5">
            {bundleLoading ? (
              <div className="py-16 text-center text-sm text-slate-400">Merging metadata across scrapers...</div>
            ) : !bundle ? (
              <div className="py-16 text-center text-sm text-slate-500">Select a candidate on the left to preview metadata and artwork.</div>
            ) : (
              <>
                <div className="flex gap-4">
                  <div className="w-28 shrink-0">
                    <PosterImage filePath={selectedArtwork.poster || bundle.artwork.find((a) => a.kind === 'poster')?.url} alt={bundle.title} />
                  </div>
                  <div className="flex-1 min-w-0 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-lg font-bold text-white">
                          {bundle.title} {bundle.year ? <span className="text-slate-400 font-normal">({bundle.year})</span> : null}
                        </h4>
                        {bundle.tagline && <p className="text-xs italic text-sky-300/90 mt-0.5">“{bundle.tagline}”</p>}
                      </div>
                      {bundle.mpaa && (
                        <span className="px-2 py-0.5 rounded border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200">
                          {bundle.mpaa}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {bundle.sourcesUsed.map((src: ScraperProviderId) => (
                        <span key={src} className="px-2 py-0.5 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-bold uppercase">
                          {src}
                        </span>
                      ))}
                      <span className="px-2 py-0.5 rounded-full bg-slate-800 border border-slate-700 text-slate-300 text-[10px] font-semibold uppercase">
                        {bundle.dataOrigin === 'hybrid'
                          ? 'Live + Catalog'
                          : bundle.dataOrigin === 'live-api'
                            ? 'Live API'
                            : 'Demo Catalog'}
                      </span>
                    </div>

                    <RatingBadges ratings={bundle.ratings} />

                    <div className="text-xs text-slate-300 leading-relaxed">{bundle.plot}</div>

                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-slate-400 pt-1">
                      {bundle.genres.length > 0 && <span>Genres: <strong className="text-slate-200">{bundle.genres.join(', ')}</strong></span>}
                      {bundle.runtimeMinutes && <span>Runtime: <strong className="text-slate-200">{bundle.runtimeMinutes}m</strong></span>}
                      {bundle.setName && (
                        <span className="inline-flex items-center gap-1 text-amber-300">
                          <Layers className="w-3 h-3" /> Set: {bundle.setName}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Artwork Selector */}
                {(['poster', 'fanart', 'clearlogo', 'disc', 'banner'] as ArtworkKind[]).map((kind) => {
                  const candidates = artworkByKind(kind);
                  if (candidates.length === 0) return null;
                  return (
                    <div key={kind} className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                        <span>Choose {kind}</span>
                        <span className="text-[11px] text-slate-500">{candidates.length} available</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        {candidates.map((c, idx) => {
                          const isSelected = selectedArtwork[kind] === c.url;
                          return (
                            <button
                              key={`${kind}-${idx}`}
                              onClick={() => setSelectedArtwork((prev) => ({ ...prev, [kind]: c.url }))}
                              className={`p-1.5 rounded-xl border text-left transition cursor-pointer ${
                                isSelected ? 'border-sky-400 bg-sky-500/15' : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
                              }`}
                            >
                              <PosterImage
                                filePath={c.url}
                                alt={c.label || kind}
                                aspect={kind === 'poster' ? 'poster' : kind === 'banner' ? 'banner' : kind === 'clearlogo' ? 'logo' : kind === 'disc' ? 'square' : 'fanart'}
                              />
                              <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-400 px-0.5">
                                <span className="uppercase font-bold text-sky-300">{c.provider}</span>
                                <span>{c.width && c.height ? `${c.width}×${c.height}` : 'HD'}</span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-800 bg-slate-900/70 flex items-center justify-between">
          <div className="text-xs text-slate-400">
            Applying saves metadata, downloads selected Kodi artwork, and writes updated NFO XML.
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3.5 py-2 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold cursor-pointer">
              Cancel
            </button>
            <button
              onClick={handleApply}
              disabled={!bundle}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              Apply Metadata & Write NFO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
