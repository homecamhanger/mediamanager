import React, { useEffect, useState } from 'react';
import { Calendar, CheckCircle2, Clock, Film, Globe2, Loader2, RefreshCw, Search, Sparkles, Star, Tv, Users, X } from 'lucide-react';
import type {
  EpisodeScrapePreview,
  ScrapedEpisodePart,
  ScraperProviderId,
  ScraperSearchResult,
  TvEpisodeRecord,
  TvShowRecord,
} from '../../shared/types.js';
import { api } from '../lib/api.js';
import { fileOperations } from '../lib/fileOperations.js';
import { useEscapeKey } from '../lib/useEscapeKey.js';

interface Props {
  open: boolean;
  show: TvShowRecord;
  episode: TvEpisodeRecord;
  onClose: () => void;
  onApplied: (updated: TvEpisodeRecord) => void;
}

export const EpisodeScrapeModal: React.FC<Props> = ({ open, show, episode, onClose, onApplied }) => {
  const [seasonNumber, setSeasonNumber] = useState<number>(episode.seasonNumber);
  const [episodeNumber, setEpisodeNumber] = useState<number>(episode.episodeNumber);
  const [multiEpisodeEnd, setMultiEpisodeEnd] = useState<string>(
    episode.multiEpisodeEnd != null && episode.multiEpisodeEnd > episode.episodeNumber
      ? String(episode.multiEpisodeEnd)
      : ''
  );

  const [overrideOpen, setOverrideOpen] = useState(false);
  const [showQuery, setShowQuery] = useState(show.title);
  const [showHits, setShowHits] = useState<ScraperSearchResult[]>([]);
  const [searchingShow, setSearchingShow] = useState(false);
  const [selectedShowHit, setSelectedShowHit] = useState<{ provider: ScraperProviderId; externalId: string; title: string } | null>(null);

  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<EpisodeScrapePreview | null>(null);
  const [parts, setParts] = useState<ScrapedEpisodePart[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(open, onClose);

  const loadPreview = async (override?: { provider: ScraperProviderId; externalId: string } | null) => {
    setLoading(true);
    setError(null);
    try {
      const endParsed = multiEpisodeEnd.trim() ? Number(multiEpisodeEnd) : null;
      const res = await api.previewEpisodeScrape(episode.id, {
        seasonNumber,
        episodeNumber,
        multiEpisodeEnd: endParsed && endParsed > episodeNumber ? endParsed : null,
        ...(override ? { provider: override.provider, externalId: override.externalId } : {}),
      });
      setPreview(res.preview);
      setParts(res.preview.parts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    setSeasonNumber(episode.seasonNumber);
    setEpisodeNumber(episode.episodeNumber);
    setMultiEpisodeEnd(
      episode.multiEpisodeEnd != null && episode.multiEpisodeEnd > episode.episodeNumber
        ? String(episode.multiEpisodeEnd)
        : ''
    );
    setShowQuery(show.title);
    setSelectedShowHit(null);
    setOverrideOpen(false);
    setShowHits([]);

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await api.previewEpisodeScrape(episode.id, {
          seasonNumber: episode.seasonNumber,
          episodeNumber: episode.episodeNumber,
          multiEpisodeEnd:
            episode.multiEpisodeEnd != null && episode.multiEpisodeEnd > episode.episodeNumber
              ? episode.multiEpisodeEnd
              : null,
        });
        if (!cancelled) {
          setPreview(res.preview);
          setParts(res.preview.parts);
        }
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, episode.id, show.title, episode.seasonNumber, episode.episodeNumber, episode.multiEpisodeEnd]);

  if (!open) return null;

  const handleSearchShow = async () => {
    if (!showQuery.trim()) return;
    setSearchingShow(true);
    try {
      const res = await api.searchScrapers(showQuery.trim(), 'tvshow', show.year);
      setShowHits(res.results);
    } finally {
      setSearchingShow(false);
    }
  };

  const handleApply = () => {
    if (parts.length === 0) return;
    const endParsed = multiEpisodeEnd.trim() ? Number(multiEpisodeEnd) : null;
    const payload = {
      parts,
      showUniqueIds: preview?.showUniqueIds,
      seasonNumber,
      episodeNumber,
      multiEpisodeEnd: endParsed && endParsed > episodeNumber ? endParsed : null,
      writeNfo: true,
    };

    // Close immediately and let the write continue in the background. NFO writes
    // on a network share can take seconds, and blocking the dialog on them left
    // "Cancel" as the only affordance.
    setError(null);
    onClose();
    const code = `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;
    fileOperations.enqueue({
      label: `Write NFO · ${episode.showTitle || 'Episode'} ${code}`,
      run: async () => {
        const res = await api.applyEpisodeScrape(episode.id, payload);
        onApplied(res.episode);
        return 'Episode metadata & NFO saved';
      },
    });
  };

  const updatePartField = <K extends keyof ScrapedEpisodePart>(index: number, key: K, value: ScrapedEpisodePart[K]) => {
    setParts((prev) => prev.map((p, idx) => (idx === index ? { ...p, [key]: value } : p)));
  };

  const epRangeLabel =
    multiEpisodeEnd.trim() && Number(multiEpisodeEnd) > episodeNumber
      ? `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}-E${String(Number(multiEpisodeEnd)).padStart(2, '0')}`
      : `S${String(seasonNumber).padStart(2, '0')}E${String(episodeNumber).padStart(2, '0')}`;

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-[#0e1422] border border-slate-700/80 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-800 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />
              <span className="truncate">
                Scrape Episode · {show.title} ({epRangeLabel})
              </span>
            </h3>
            <p className="text-[11px] text-slate-400 mt-0.5 truncate">
              File: <span className="text-slate-300 font-mono">{episode.fileName}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Episode Range + Show Match Controls */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-900/50 space-y-2.5">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex flex-wrap items-end gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Season
                </label>
                <input
                  type="number"
                  min={0}
                  value={seasonNumber}
                  onChange={(e) => setSeasonNumber(Math.max(0, Number(e.target.value || 0)))}
                  className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Start Ep
                </label>
                <input
                  type="number"
                  min={1}
                  value={episodeNumber}
                  onChange={(e) => setEpisodeNumber(Math.max(1, Number(e.target.value || 1)))}
                  className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  End Ep (Multi-Part)
                </label>
                <input
                  type="number"
                  min={episodeNumber + 1}
                  placeholder="Single"
                  value={multiEpisodeEnd}
                  onChange={(e) => setMultiEpisodeEnd(e.target.value)}
                  className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white font-mono"
                />
              </div>
              <button
                onClick={() => loadPreview(selectedShowHit)}
                disabled={loading}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Fetch Episode{multiEpisodeEnd.trim() && Number(multiEpisodeEnd) > episodeNumber ? 's' : ''}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setOverrideOpen((v) => !v)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-slate-300 flex items-center gap-1.5 cursor-pointer"
            >
              <Tv className="w-3.5 h-3.5 text-sky-400" />
              {selectedShowHit ? `Matched: ${selectedShowHit.title}` : 'Change Matched Series'}
            </button>
          </div>

          {overrideOpen && (
            <div className="pt-2 border-t border-slate-800/80 space-y-2">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={showQuery}
                  onChange={(e) => setShowQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void handleSearchShow()}
                  placeholder="Search TV series title..."
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-white"
                />
                <button
                  type="button"
                  onClick={handleSearchShow}
                  disabled={searchingShow}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
                >
                  {searchingShow ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
                  Search Show
                </button>
              </div>
              {showHits.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {showHits.slice(0, 6).map((hit) => {
                    const active =
                      selectedShowHit?.provider === hit.provider && selectedShowHit?.externalId === hit.externalId;
                    return (
                      <button
                        key={`${hit.provider}-${hit.externalId}`}
                        type="button"
                        onClick={() => {
                          const next = { provider: hit.provider, externalId: hit.externalId, title: hit.title };
                          setSelectedShowHit(next);
                          setOverrideOpen(false);
                          void loadPreview(next);
                        }}
                        className={`px-2.5 py-1 rounded-lg border text-[11px] cursor-pointer transition ${
                          active
                            ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                            : 'bg-slate-950 border-slate-800 text-slate-300 hover:border-slate-600'
                        }`}
                      >
                        <span className="font-semibold">{hit.title}</span>
                        {hit.year ? ` (${hit.year})` : ''} · <span className="uppercase text-[10px] text-slate-400">{hit.provider}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-xl border border-rose-500/40 bg-rose-500/10 text-xs text-rose-200">
              {error}
            </div>
          )}

          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2 text-xs">
              <Loader2 className="w-6 h-6 text-sky-400 animate-spin" />
              Fetching episode metadata from enabled providers...
            </div>
          ) : preview ? (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span
                    className={`px-2 py-0.5 rounded font-semibold ${
                      preview.matched
                        ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-300'
                        : 'bg-amber-500/15 border border-amber-500/30 text-amber-300'
                    }`}
                  >
                    {preview.matched
                      ? `Matched ${parts.length} episode part${parts.length === 1 ? '' : 's'}`
                      : 'No direct episode match found — review or edit manually'}
                  </span>
                  {preview.sourcesUsed.map((s) => (
                    <span
                      key={s}
                      className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-[10px] uppercase font-bold text-sky-300 flex items-center gap-1"
                    >
                      <Globe2 className="w-3 h-3" /> {s}
                    </span>
                  ))}
                </div>
                {parts.length > 1 && (
                  <span className="text-[11px] text-indigo-300 font-semibold">
                    Multi-episode file: writes {parts.length} &lt;episodedetails&gt; blocks in Kodi NFO
                  </span>
                )}
              </div>

              <div className="space-y-3">
                {parts.map((part, idx) => {
                  const partCode = `S${String(part.seasonNumber).padStart(2, '0')}E${String(part.episodeNumber).padStart(2, '0')}`;
                  return (
                    <div
                      key={`${part.seasonNumber}-${part.episodeNumber}-${idx}`}
                      className="p-4 rounded-xl bg-slate-900/75 border border-slate-800 space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-xs font-bold">
                            Part {idx + 1} · {partCode}
                          </span>
                          {part.ratings[0] && (
                            <span className="px-2 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[11px] font-semibold flex items-center gap-1">
                              <Star className="w-3 h-3" />
                              {part.ratings[0].source.toUpperCase()} {part.ratings[0].value}
                            </span>
                          )}
                          {part.actors.length > 0 && (
                            <span className="text-[11px] text-slate-400 flex items-center gap-1">
                              <Users className="w-3 h-3 text-emerald-400" /> {part.actors.length} cast/guest
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-slate-400">
                          {part.aired && (
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" /> {part.aired}
                            </span>
                          )}
                          {part.runtimeMinutes && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" /> {part.runtimeMinutes}m
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-start">
                        {part.thumbUrl && idx === 0 && (
                          <div className="md:col-span-3 rounded-lg overflow-hidden border border-slate-800 bg-slate-950 aspect-video">
                            <img src={part.thumbUrl} alt={part.title} className="w-full h-full object-cover" />
                          </div>
                        )}
                        <div className={part.thumbUrl && idx === 0 ? 'md:col-span-9 space-y-2' : 'md:col-span-12 space-y-2'}>
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                            <div className="sm:col-span-2">
                              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-0.5">
                                Title
                              </label>
                              <input
                                type="text"
                                value={part.title}
                                onChange={(e) => updatePartField(idx, 'title', e.target.value)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
                              />
                            </div>
                            <div>
                              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-0.5">
                                Aired (YYYY-MM-DD)
                              </label>
                              <input
                                type="text"
                                value={part.aired ?? ''}
                                onChange={(e) => updatePartField(idx, 'aired', e.target.value || null)}
                                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-white"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-0.5">
                              Plot
                            </label>
                            <textarea
                              rows={2}
                              value={part.plot}
                              onChange={(e) => updatePartField(idx, 'plot', e.target.value)}
                              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 leading-relaxed"
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400">
                            {part.directors.length > 0 && (
                              <span className="flex items-center gap-1">
                                <Film className="w-3 h-3 text-emerald-400" /> Dir: {part.directors.join(', ')}
                              </span>
                            )}
                            {part.writers.length > 0 && <span>Writers: {part.writers.join(', ')}</span>}
                            {Object.entries(part.uniqueIds)
                              .filter(([, v]) => Boolean(v))
                              .map(([k, v]) => (
                                <span key={k} className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-300">
                                  {k}:{v}
                                </span>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-3">
          <span className="text-[11px] text-slate-400">
            Saves scraped metadata, episode thumbnail, and Kodi <code className="text-sky-300">&lt;episodedetails&gt;</code> NFO.
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleApply}
              disabled={loading || parts.length === 0}
              className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              Apply &amp; Write NFO
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
