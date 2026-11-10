import React, { useEffect, useMemo, useState } from 'react';
import {
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Clapperboard,
  Eye,
  FileCode2,
  FolderOpen,
  Layers,
  Plus,
  Search,
  Sparkles,
  Square,
  Subtitles,
  Tv,
  Users,
  X,
} from 'lucide-react';
import type { MovieRecord, MovieSetRecord } from '../../shared/types.js';
import { api } from '../lib/api.js';
import {
  filterMoviesByActorAndQuery,
  filterSetsByActorAndQuery,
  filterShowTreeByActorAndQuery,
  findActorMatch,
} from '../lib/castFilter.js';
import type { LeftLibraryTab, SelectedMedia, ShowTreeNode } from '../lib/workspaceTypes.js';
import { PosterImage } from './PosterImage.js';

type MovieFilter = 'all' | 'unscraped' | 'missing_nfo' | 'nfo_warnings' | 'missing_subs' | '4k' | 'unwatched';
type TvFilter = 'all' | 'unscraped' | 'missing_nfo' | 'nfo_warnings' | 'missing_subs';

interface MediaTreeSidebarProps {
  activeTab: LeftLibraryTab;
  onTabChange: (tab: LeftLibraryTab) => void;
  movies: MovieRecord[];
  showTree: ShowTreeNode[];
  sets: MovieSetRecord[];
  selected: SelectedMedia;
  actorFilter: string | null;
  onClearActorFilter: () => void;
  onSelectMedia: (sel: SelectedMedia) => void;
  onRefresh: () => Promise<void> | void;
  onToast: (msg: string) => void;
}

export const MediaTreeSidebar: React.FC<MediaTreeSidebarProps> = ({
  activeTab,
  onTabChange,
  movies,
  showTree,
  sets,
  selected,
  actorFilter,
  onClearActorFilter,
  onSelectMedia,
  onRefresh,
  onToast,
}) => {
  const [search, setSearch] = useState('');
  const [movieFilter, setMovieFilter] = useState<MovieFilter>('all');
  const [tvFilter, setTvFilter] = useState<TvFilter>('all');
  const [checkedMovieIds, setCheckedMovieIds] = useState<Set<number>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const [expandedShows, setExpandedShows] = useState<Set<number>>(new Set());
  const [expandedSeasons, setExpandedSeasons] = useState<Set<string>>(new Set());
  const [expandedSets, setExpandedSets] = useState<Set<number>>(new Set());

  // Automatically expand the first Show -> Season once tree loads, and ensure selected show/season/set stays expanded
  useEffect(() => {
    if (showTree.length > 0 && expandedShows.size === 0) {
      const first = showTree[0];
      setExpandedShows(new Set([first.show.id]));
      if (first.seasons[0]) {
        setExpandedSeasons(new Set([`${first.show.id}:${first.seasons[0].seasonNumber}`]));
      }
    }
  }, [showTree, expandedShows.size]);

  useEffect(() => {
    if (sets.length > 0 && expandedSets.size === 0) {
      setExpandedSets(new Set(sets.map((s) => s.id)));
    }
  }, [sets, expandedSets.size]);

  useEffect(() => {
    if (selected?.kind === 'show') {
      setExpandedShows((prev) => (prev.has(selected.showId) ? prev : new Set([...prev, selected.showId])));
      if (selected.seasonNumber != null) {
        const key = `${selected.showId}:${selected.seasonNumber}`;
        setExpandedSeasons((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
      }
    } else if (selected?.kind === 'episode') {
      setExpandedShows((prev) => (prev.has(selected.showId) ? prev : new Set([...prev, selected.showId])));
      const node = showTree.find((n) => n.show.id === selected.showId);
      const ep = node?.episodes.find((e) => e.id === selected.episodeId);
      if (ep) {
        const effSeason = ep.displaySeason ?? ep.seasonNumber;
        const key = `${selected.showId}:${effSeason}`;
        setExpandedSeasons((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
      }
    }
  }, [selected, showTree]);

  // Quick Set creation inside Sets tab
  const [newSetOpen, setNewSetOpen] = useState(false);
  const [newSetName, setNewSetName] = useState('');

  const q = search.toLowerCase().trim();
  const actorNeedle = actorFilter?.trim().toLowerCase() || '';

  const actorMovieMatches = useMemo(
    () => (actorNeedle ? filterMoviesByActorAndQuery(movies, actorFilter, '') : movies),
    [movies, actorFilter, actorNeedle]
  );

  const actorShowMatches = useMemo(
    () => (actorNeedle ? filterShowTreeByActorAndQuery(showTree, actorFilter, '') : []),
    [showTree, actorFilter, actorNeedle]
  );

  const filteredMovies = useMemo(() => {
    return filterMoviesByActorAndQuery(movies, actorFilter, search).filter((m) => {
      if (movieFilter === 'unscraped' && m.scraped) return false;
      if (movieFilter === 'missing_nfo' && m.hasNfo) return false;
      if (movieFilter === 'nfo_warnings' && !(m.hasNfo && (!m.nfoValid || m.nfoWarnings.length > 0))) return false;
      if (movieFilter === 'missing_subs' && m.subtitles.length > 0) return false;
      if (movieFilter === 'unwatched' && m.watched) return false;
      if (movieFilter === '4k' && m.parsedInfo.resolution !== '2160p' && (m.streamDetails.video[0]?.height ?? 0) < 2000) {
        return false;
      }
      return true;
    });
  }, [movies, actorFilter, search, movieFilter]);

  const filteredShowTree = useMemo(() => {
    return filterShowTreeByActorAndQuery(showTree, actorFilter, search)
      .map(({ node }) => {
        const showHasNfoWarn = node.show.hasNfo && (!node.show.nfoValid || node.show.nfoWarnings.length > 0);
        const epHasNfoWarn = (ep: ShowTreeNode['episodes'][number]) =>
          ep.hasNfo && (!ep.nfoValid || ep.nfoWarnings.length > 0);
        const epMissingSubs = (ep: ShowTreeNode['episodes'][number]) => ep.subtitles.length === 0;

        const showMatchesFilter =
          tvFilter === 'all' ||
          (tvFilter === 'unscraped' && !node.show.scraped) ||
          (tvFilter === 'missing_nfo' && (!node.show.hasNfo || node.show.missingNfoCount > 0)) ||
          (tvFilter === 'nfo_warnings' && (showHasNfoWarn || node.episodes.some(epHasNfoWarn))) ||
          (tvFilter === 'missing_subs' && node.episodes.some(epMissingSubs));
        if (!showMatchesFilter) return null;

        if (tvFilter === 'nfo_warnings' && !showHasNfoWarn) {
          const warnEps = node.episodes.filter(epHasNfoWarn);
          const seasonNums = new Set(warnEps.map((e) => e.displaySeason ?? e.seasonNumber));
          return {
            show: node.show,
            seasons: node.seasons.filter((s) => seasonNums.has(s.seasonNumber)),
            episodes: warnEps,
          };
        }
        if (tvFilter === 'missing_subs') {
          const noSubEps = node.episodes.filter(epMissingSubs);
          const seasonNums = new Set(noSubEps.map((e) => e.displaySeason ?? e.seasonNumber));
          return {
            show: node.show,
            seasons: node.seasons.filter((s) => seasonNums.has(s.seasonNumber)),
            episodes: noSubEps,
          };
        }
        return node;
      })
      .filter((x): x is ShowTreeNode => Boolean(x));
  }, [showTree, actorFilter, search, tvFilter]);

  const filteredSets = useMemo(
    () => filterSetsByActorAndQuery(sets, actorFilter, search),
    [sets, actorFilter, search]
  );

  const toggleMovieCheck = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCheckedMovieIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllFilteredMovies = () => {
    if (checkedMovieIds.size === filteredMovies.length && filteredMovies.length > 0) {
      setCheckedMovieIds(new Set());
    } else {
      setCheckedMovieIds(new Set(filteredMovies.map((m) => m.id)));
    }
  };

  const runMovieBatch = async (kind: 'scrape' | 'nfo' | 'subs' | 'watched') => {
    const ids = [...checkedMovieIds];
    if (ids.length === 0) return;
    setBatchBusy(true);
    try {
      if (kind === 'scrape') await api.batchScrape({ movieIds: ids });
      else if (kind === 'nfo') await api.batchMovies('writeNfo', ids);
      else if (kind === 'subs') await api.batchMissingSubtitles({ movieIds: ids });
      else if (kind === 'watched') await api.batchMovies('markWatched', ids);
      await onRefresh();
      onToast(`Batch ${kind} completed for ${ids.length} movie${ids.length === 1 ? '' : 's'}`);
    } finally {
      setBatchBusy(false);
    }
  };

  const toggleShowExpand = (showId: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setExpandedShows((prev) => {
      const next = new Set(prev);
      if (next.has(showId)) next.delete(showId);
      else next.add(showId);
      return next;
    });
  };

  const toggleSeasonExpand = (showId: number, seasonNumber: number, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const key = `${showId}:${seasonNumber}`;
    setExpandedSeasons((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const expandAllTv = () => {
    setExpandedShows(new Set(showTree.map((n) => n.show.id)));
    const allSeasonKeys: string[] = [];
    for (const n of showTree) {
      for (const s of n.seasons) {
        allSeasonKeys.push(`${n.show.id}:${s.seasonNumber}`);
      }
    }
    setExpandedSeasons(new Set(allSeasonKeys));
  };

  const collapseAllTv = () => {
    setExpandedShows(new Set());
    setExpandedSeasons(new Set());
  };

  const handleQuickCreateSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSetName.trim()) return;
    const res = await api.createSet(newSetName.trim(), '');
    setNewSetName('');
    setNewSetOpen(false);
    await onRefresh();
    if (res.set) {
      setExpandedSets((prev) => new Set([...prev, res.set.id]));
      onSelectMedia({ kind: 'set', setId: res.set.id });
    }
  };

  return (
    <aside className="w-80 xl:w-[340px] shrink-0 bg-[#0d1320] border-r border-slate-800/90 flex flex-col min-h-0">
      {/* 3 Primary Library Tabs: Movies | TV Shows | Movie Sets */}
      <div className="grid grid-cols-3 border-b border-slate-800 bg-[#0a0f1a]">
        {[
          {
            id: 'movies' as const,
            label: 'Movies',
            count: actorNeedle ? actorMovieMatches.length : movies.length,
            icon: <Clapperboard className="w-3.5 h-3.5" />,
          },
          {
            id: 'tvshows' as const,
            label: 'TV Shows',
            count: actorNeedle ? actorShowMatches.length : showTree.length,
            icon: <Tv className="w-3.5 h-3.5" />,
          },
          {
            id: 'sets' as const,
            label: 'Sets',
            count: actorNeedle ? filteredSets.length : sets.length,
            icon: <Layers className="w-3.5 h-3.5" />,
          },
        ].map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => onTabChange(t.id)}
              className={`py-2 px-1.5 text-[11px] font-bold flex items-center justify-center gap-1 border-b-2 transition cursor-pointer ${
                active
                  ? 'border-sky-400 text-sky-300 bg-[#111827]'
                  : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/50'
              }`}
            >
              {t.icon}
              <span>{t.label}</span>
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  active ? 'bg-sky-500/20 text-sky-300' : 'bg-slate-800 text-slate-400'
                }`}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Persistent Active Cast Filter Banner */}
      {actorFilter && (
        <div className="px-2.5 py-1.5 bg-sky-500/15 border-b border-sky-500/35 flex items-center justify-between gap-2 text-xs">
          <div className="min-w-0 flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-sky-300 shrink-0" />
            <div className="min-w-0">
              <div className="text-[11px] font-bold text-sky-200 truncate">Cast: {actorFilter}</div>
              <div className="text-[10px] text-sky-300/80 flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => onTabChange('movies')}
                  className="hover:underline cursor-pointer"
                >
                  {actorMovieMatches.length} Movie{actorMovieMatches.length === 1 ? '' : 's'}
                </button>
                <span>·</span>
                <button
                  type="button"
                  onClick={() => onTabChange('tvshows')}
                  className="hover:underline cursor-pointer"
                >
                  {actorShowMatches.length} TV Show{actorShowMatches.length === 1 ? '' : 's'}
                </button>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClearActorFilter}
            aria-label="Clear cast filter"
            title="Clear cast filter"
            className="p-1 rounded-md hover:bg-sky-500/25 text-sky-200 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="p-2 border-b border-slate-800/80 space-y-1.5 bg-[#0f1625]">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              activeTab === 'movies'
                ? 'Filter movies, year, actor...'
                : activeTab === 'tvshows'
                  ? 'Filter shows, eps, actor...'
                  : 'Filter movie sets, actor...'
            }
            className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-7 py-1.5 text-xs text-slate-100 placeholder:text-slate-500"
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              className="absolute right-2 top-1.5 text-slate-500 hover:text-slate-200 cursor-pointer"
              title="Clear filter"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Movies sub-controls */}
        {activeTab === 'movies' && (
          <div className="flex items-center justify-between gap-1.5">
            <select
              value={movieFilter}
              onChange={(e) => setMovieFilter(e.target.value as MovieFilter)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-[11px] text-slate-200"
            >
              <option value="all">All Movies ({movies.length})</option>
              <option value="unscraped">Unscraped Only</option>
              <option value="missing_nfo">Missing NFO</option>
              <option value="nfo_warnings">NFO Warnings</option>
              <option value="missing_subs">No Subtitles</option>
              <option value="4k">4K UHD Only</option>
              <option value="unwatched">Unwatched Only</option>
            </select>
            <button
              onClick={toggleAllFilteredMovies}
              title="Select/Deselect all visible movies"
              className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 flex items-center gap-1 cursor-pointer"
            >
              {checkedMovieIds.size === filteredMovies.length && filteredMovies.length > 0 ? (
                <CheckSquare className="w-3 h-3 text-sky-400" />
              ) : (
                <Square className="w-3 h-3" />
              )}
              <span>{checkedMovieIds.size > 0 ? checkedMovieIds.size : 'All'}</span>
            </button>
          </div>
        )}

        {/* Batch bar for checked movies */}
        {activeTab === 'movies' && checkedMovieIds.size > 0 && (
          <div className="p-1.5 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-between gap-1">
            <span className="text-[10px] font-bold text-sky-200 pl-1">{checkedMovieIds.size} sel</span>
            <div className="flex items-center gap-1">
              <button
                disabled={batchBusy}
                onClick={() => runMovieBatch('scrape')}
                className="px-1.5 py-0.5 rounded bg-sky-500 hover:bg-sky-400 text-white text-[10px] font-bold cursor-pointer"
              >
                Scrape
              </button>
              <button
                disabled={batchBusy}
                onClick={() => runMovieBatch('nfo')}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold cursor-pointer"
              >
                NFO
              </button>
              <button
                disabled={batchBusy}
                onClick={() => runMovieBatch('subs')}
                className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-[10px] font-semibold cursor-pointer"
              >
                Subs
              </button>
              <button
                disabled={batchBusy}
                onClick={() => runMovieBatch('watched')}
                className="px-1.5 py-0.5 rounded bg-purple-500/20 hover:bg-purple-500/30 border border-purple-500/40 text-purple-200 text-[10px] font-semibold cursor-pointer"
              >
                Watched
              </button>
            </div>
          </div>
        )}

        {/* TV Shows sub-controls */}
        {activeTab === 'tvshows' && (
          <div className="flex items-center justify-between gap-1.5">
            <select
              value={tvFilter}
              onChange={(e) => setTvFilter(e.target.value as TvFilter)}
              className="flex-1 bg-slate-950 border border-slate-800 rounded-md px-2 py-1 text-[11px] text-slate-200"
            >
              <option value="all">All Series ({showTree.length})</option>
              <option value="unscraped">Unscraped Series</option>
              <option value="missing_nfo">Missing NFOs</option>
              <option value="nfo_warnings">NFO Warnings</option>
              <option value="missing_subs">No Subtitles</option>
            </select>
            <button
              onClick={expandAllTv}
              className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 text-[10px] font-semibold text-slate-300 cursor-pointer"
              title="Expand all shows and seasons"
            >
              Expand
            </button>
            <button
              onClick={collapseAllTv}
              className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 text-[10px] font-semibold text-slate-300 cursor-pointer"
              title="Collapse all"
            >
              Collapse
            </button>
          </div>
        )}

        {/* Sets sub-controls */}
        {activeTab === 'sets' && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">Kodi &lt;set&gt; Collections</span>
              <button
                onClick={() => setNewSetOpen((v) => !v)}
                className="px-2 py-1 rounded-md bg-sky-500/20 border border-sky-500/40 text-sky-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> New Set
              </button>
            </div>
            {newSetOpen && (
              <form onSubmit={handleQuickCreateSet} className="flex gap-1">
                <input
                  value={newSetName}
                  onChange={(e) => setNewSetName(e.target.value)}
                  placeholder="Collection name..."
                  autoFocus
                  className="flex-1 bg-slate-950 border border-slate-700 rounded-md px-2 py-1 text-[11px] text-slate-100"
                />
                <button
                  type="submit"
                  className="px-2 py-1 rounded-md bg-sky-500 text-white text-[10px] font-bold cursor-pointer"
                >
                  Add
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* Scrollable Dense List / Hierarchy Tree */}
      <div className="flex-1 overflow-y-auto divide-y divide-slate-800/50">
        {/* MOVIES TAB */}
        {activeTab === 'movies' &&
          (filteredMovies.length === 0 ? (
            <EmptyListState text="No movies match your filter." />
          ) : (
            filteredMovies.map((m) => {
              const isSelected = selected?.kind === 'movie' && selected.movieId === m.id;
              const isChecked = checkedMovieIds.has(m.id);
              const resLabel =
                m.parsedInfo.resolution?.toUpperCase() ||
                (m.streamDetails.video[0]?.height >= 2000
                  ? '4K'
                  : m.streamDetails.video[0]?.height >= 1000
                    ? '1080p'
                    : '');
              return (
                <div
                  key={m.id}
                  onClick={() => onSelectMedia({ kind: 'movie', movieId: m.id })}
                  className={`px-2.5 py-1.5 flex items-center gap-2 cursor-pointer transition ${
                    isSelected
                      ? 'bg-sky-500/15 border-l-2 border-l-sky-400'
                      : 'hover:bg-slate-800/45 border-l-2 border-l-transparent'
                  }`}
                >
                  <button
                    onClick={(e) => toggleMovieCheck(m.id, e)}
                    className="text-slate-500 hover:text-sky-300 shrink-0 cursor-pointer"
                    title="Select for batch action"
                  >
                    {isChecked ? <CheckSquare className="w-3.5 h-3.5 text-sky-400" /> : <Square className="w-3.5 h-3.5" />}
                  </button>

                  <div className="w-6 h-9 shrink-0 overflow-hidden rounded">
                    <PosterImage filePath={m.artwork.poster} alt={m.title} compact className="rounded" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1">
                      <span className={`text-xs font-semibold truncate ${isSelected ? 'text-white' : 'text-slate-200'}`}>
                        {m.title}
                      </span>
                      {m.year && <span className="text-[10px] text-slate-400 shrink-0">{m.year}</span>}
                    </div>
                    {actorNeedle && (() => {
                      const matchedActor = findActorMatch(m.actors, actorNeedle);
                      if (!matchedActor) return null;
                      return (
                        <div className="text-[10px] text-sky-300 truncate">
                          as {matchedActor.role || 'Cast'}
                        </div>
                      );
                    })()}
                    <div className="flex items-center justify-between gap-1 mt-0.5">
                      <div className="flex items-center gap-1 min-w-0">
                        {resLabel && (
                          <span className="px-1 rounded bg-slate-800 text-[9px] font-mono text-amber-300">
                            {resLabel === '2160P' ? '4K' : resLabel}
                          </span>
                        )}
                        {!m.scraped && (
                          <span className="px-1 rounded bg-amber-500/20 text-[9px] font-bold text-amber-300">UNSCRAPED</span>
                        )}
                        {m.setName && (
                          <span className="text-[9px] text-slate-500 truncate">{m.setName}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span
                          title={
                            !m.hasNfo
                              ? 'Missing NFO'
                              : !m.nfoValid || m.nfoWarnings.length > 0
                                ? `NFO warnings (${m.nfoWarnings.length})`
                                : 'Valid NFO'
                          }
                          className={`w-1.5 h-1.5 rounded-full ${
                            !m.hasNfo
                              ? 'bg-rose-400/80'
                              : !m.nfoValid || m.nfoWarnings.length > 0
                                ? 'bg-amber-400'
                                : 'bg-emerald-400'
                          }`}
                        />
                        <span
                          title={m.subtitles.length > 0 ? `${m.subtitles.length} subtitle(s)` : 'No subtitles'}
                          className={`w-1.5 h-1.5 rounded-full ${m.subtitles.length > 0 ? 'bg-sky-400' : 'bg-slate-700'}`}
                        />
                        <span
                          title={m.watched ? 'Watched' : 'Unwatched'}
                          className={`w-1.5 h-1.5 rounded-full ${m.watched ? 'bg-purple-400' : 'bg-slate-700'}`}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ))}

        {/* TV SHOWS TAB: Collapsible Show -> Seasons -> Episodes Hierarchy */}
        {activeTab === 'tvshows' &&
          (filteredShowTree.length === 0 ? (
            <EmptyListState text="No TV shows match your filter." />
          ) : (
            filteredShowTree.map(({ show, seasons, episodes }) => {
              const showActorMatch = actorNeedle ? findActorMatch(show.actors, actorNeedle) : null;
              const hasEpisodeActorMatches = Boolean(actorNeedle && !showActorMatch && episodes.length > 0);
              const isShowExpanded = expandedShows.has(show.id) || Boolean(q) || hasEpisodeActorMatches;
              const isShowSelected =
                selected?.kind === 'show' && selected.showId === show.id && selected.seasonNumber == null;
              const sortedSeasons = [...seasons].sort((a, b) => a.seasonNumber - b.seasonNumber);

              return (
                <div key={show.id} className="select-none">
                  {/* Level 1: Show Row */}
                  <div
                    onClick={() => {
                      setExpandedShows((prev) => new Set([...prev, show.id]));
                      onSelectMedia({ kind: 'show', showId: show.id, seasonNumber: null });
                    }}
                    className={`px-2 py-1.5 flex items-center gap-1.5 cursor-pointer transition ${
                      isShowSelected
                        ? 'bg-sky-500/15 border-l-2 border-l-sky-400'
                        : 'hover:bg-slate-800/45 border-l-2 border-l-transparent'
                    }`}
                  >
                    <button
                      onClick={(e) => toggleShowExpand(show.id, e)}
                      className="p-0.5 rounded hover:bg-slate-700/70 text-slate-400 shrink-0 cursor-pointer"
                      aria-label={isShowExpanded ? 'Collapse show' : 'Expand show'}
                    >
                      {isShowExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>

                    <div className="w-6 h-9 shrink-0 overflow-hidden rounded">
                      <PosterImage filePath={show.artwork.poster} alt={show.title} compact className="rounded" />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <span className={`text-xs font-bold truncate ${isShowSelected ? 'text-white' : 'text-slate-100'}`}>
                          {show.title}
                        </span>
                        {show.year && <span className="text-[10px] text-slate-400 shrink-0">{show.year}</span>}
                      </div>
                      {actorNeedle && (showActorMatch || hasEpisodeActorMatches) && (
                        <div className="text-[10px] text-sky-300 truncate">
                          {showActorMatch
                            ? `as ${showActorMatch.role || 'Series Cast'}`
                            : `Guest in ${episodes.length} episode${episodes.length === 1 ? '' : 's'}`}
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-1 mt-0.5 text-[10px] text-slate-400">
                        <div className="flex items-center gap-1.5">
                          <span>
                            {show.seasonsCount}S · {show.episodesCount}E
                          </span>
                          {!show.scraped && (
                            <span className="px-1 rounded bg-amber-500/20 text-[9px] font-bold text-amber-300">UNSCRAPED</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <span
                            title={
                              !show.hasNfo
                                ? 'Missing tvshow.nfo'
                                : !show.nfoValid || show.nfoWarnings.length > 0
                                  ? `tvshow.nfo warnings (${show.nfoWarnings.length})`
                                  : 'Valid tvshow.nfo'
                            }
                            className={`w-1.5 h-1.5 rounded-full ${
                              !show.hasNfo
                                ? 'bg-rose-400/80'
                                : !show.nfoValid || show.nfoWarnings.length > 0
                                  ? 'bg-amber-400'
                                  : 'bg-emerald-400'
                            }`}
                          />
                          <span className="text-[9px] text-slate-500">
                            {show.watchedEpisodesCount}/{show.episodesCount}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Level 2: Seasons */}
                  {isShowExpanded && (
                    <div className="bg-[#0a0f1a]/60">
                      {sortedSeasons.length === 0 ? (
                        <div className="pl-9 pr-3 py-1.5 text-[11px] text-slate-500 italic">No seasons scanned</div>
                      ) : (
                        sortedSeasons.map((season) => {
                          const sKey = `${show.id}:${season.seasonNumber}`;
                          const isSeasonExpanded = expandedSeasons.has(sKey) || Boolean(q) || hasEpisodeActorMatches;
                          const isSeasonSelected =
                            selected?.kind === 'show' &&
                            selected.showId === show.id &&
                            selected.seasonNumber === season.seasonNumber;
                          const seasonEps = episodes
                            .filter((ep) => (ep.displaySeason ?? ep.seasonNumber) === season.seasonNumber)
                            .sort((a, b) => {
                              const ae = a.displayEpisode ?? a.episodeNumber;
                              const be = b.displayEpisode ?? b.episodeNumber;
                              if (ae !== be) return ae - be;
                              return a.episodeNumber - b.episodeNumber;
                            });
                          const watchedCount = seasonEps.filter((e) => e.watched).length;

                          return (
                            <div key={sKey}>
                              <div
                                onClick={() => {
                                  setExpandedSeasons((prev) => new Set([...prev, sKey]));
                                  onSelectMedia({ kind: 'show', showId: show.id, seasonNumber: season.seasonNumber });
                                }}
                                className={`pl-5 pr-2.5 py-1 flex items-center gap-1.5 cursor-pointer transition ${
                                  isSeasonSelected
                                    ? 'bg-sky-500/15 border-l-2 border-l-sky-400 text-sky-200'
                                    : 'hover:bg-slate-800/40 border-l-2 border-l-transparent text-slate-300'
                                }`}
                              >
                                <button
                                  onClick={(e) => toggleSeasonExpand(show.id, season.seasonNumber, e)}
                                  className="p-0.5 rounded hover:bg-slate-700/70 text-slate-400 shrink-0 cursor-pointer"
                                  aria-label={isSeasonExpanded ? 'Collapse season' : 'Expand season'}
                                >
                                  {isSeasonExpanded ? (
                                    <ChevronDown className="w-3 h-3" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3" />
                                  )}
                                </button>
                                <FolderOpen className="w-3.5 h-3.5 text-amber-400/80 shrink-0" />
                                <span className="text-[11px] font-semibold truncate flex-1">{season.name}</span>
                                <span className="text-[10px] text-slate-500 shrink-0">
                                  {watchedCount}/{seasonEps.length}
                                </span>
                              </div>

                              {/* Level 3: Episodes */}
                              {isSeasonExpanded && (
                                <div className="bg-[#080c15]/70">
                                  {seasonEps.map((ep) => {
                                    const isEpSelected = selected?.kind === 'episode' && selected.episodeId === ep.id;
                                    const effSeason = ep.displaySeason ?? ep.seasonNumber;
                                    const effEp = ep.displayEpisode ?? ep.episodeNumber;
                                    const hasCustomOrder =
                                      ep.displaySeason != null ||
                                      ep.displayEpisode != null ||
                                      (ep.parsedInfo.episodeNumber != null && ep.episodeNumber !== ep.parsedInfo.episodeNumber) ||
                                      (ep.parsedInfo.seasonNumber != null && ep.seasonNumber !== ep.parsedInfo.seasonNumber);
                                    const fileCode = `S${String(ep.parsedInfo.seasonNumber ?? ep.seasonNumber).padStart(2, '0')}E${String(
                                      ep.parsedInfo.episodeNumber ?? ep.episodeNumber
                                    ).padStart(2, '0')}`;
                                    const code = `S${String(effSeason).padStart(2, '0')}E${String(effEp).padStart(2, '0')}${
                                      ep.multiEpisodeEnd ? `-${String(ep.multiEpisodeEnd).padStart(2, '0')}` : ''
                                    }`;
                                    return (
                                      <div
                                        key={ep.id}
                                        onClick={() =>
                                          onSelectMedia({ kind: 'episode', showId: show.id, episodeId: ep.id })
                                        }
                                        className={`pl-10 pr-2.5 py-1 flex items-center gap-1.5 cursor-pointer transition ${
                                          isEpSelected
                                            ? 'bg-sky-500/20 border-l-2 border-l-sky-400 text-white'
                                            : 'hover:bg-slate-800/40 border-l-2 border-l-transparent text-slate-300'
                                        }`}
                                      >
                                        <span
                                          title={hasCustomOrder ? `Custom NFO order (File: ${fileCode})` : undefined}
                                          className={`px-1 py-0.2 rounded font-mono text-[10px] font-semibold shrink-0 ${
                                            hasCustomOrder
                                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                                              : 'bg-slate-800 text-sky-300'
                                          }`}
                                        >
                                          {code}
                                        </span>
                                        <div className="min-w-0 flex-1">
                                          <div className="text-[11px] truncate">{ep.title}</div>
                                          {actorNeedle && (() => {
                                            const epActorMatch = findActorMatch(ep.actors, actorNeedle);
                                            if (!epActorMatch) return null;
                                            return (
                                              <div className="text-[9px] text-sky-300 truncate">
                                                as {epActorMatch.role || 'Guest'}
                                              </div>
                                            );
                                          })()}
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                          <span
                                            title={
                                              !ep.hasNfo
                                                ? 'Missing episode NFO'
                                                : !ep.nfoValid || ep.nfoWarnings.length > 0
                                                  ? `Episode NFO warnings (${ep.nfoWarnings.length})`
                                                  : 'Valid episode NFO'
                                            }
                                            className={`w-1.5 h-1.5 rounded-full ${
                                              !ep.hasNfo
                                                ? 'bg-rose-400/80'
                                                : !ep.nfoValid || ep.nfoWarnings.length > 0
                                                  ? 'bg-amber-400'
                                                  : 'bg-emerald-400'
                                            }`}
                                          />
                                          <span
                                            title={ep.subtitles.length > 0 ? `${ep.subtitles.length} sub(s)` : 'No subs'}
                                            className={`w-1.5 h-1.5 rounded-full ${
                                              ep.subtitles.length > 0 ? 'bg-sky-400' : 'bg-slate-700'
                                            }`}
                                          />
                                          <span
                                            title={ep.watched ? 'Watched' : 'Unwatched'}
                                            className={`w-1.5 h-1.5 rounded-full ${
                                              ep.watched ? 'bg-purple-400' : 'bg-slate-700'
                                            }`}
                                          />
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })
          ))}

        {/* MOVIE SETS TAB */}
        {activeTab === 'sets' &&
          (filteredSets.length === 0 ? (
            <EmptyListState text="No movie sets found." />
          ) : (
            filteredSets.map((s) => {
              const isSetExpanded = expandedSets.has(s.id) || Boolean(q) || Boolean(actorNeedle);
              const isSetSelected = selected?.kind === 'set' && selected.setId === s.id;
              return (
                <div key={s.id} className="select-none">
                  <div
                    onClick={() => {
                      setExpandedSets((prev) => new Set([...prev, s.id]));
                      onSelectMedia({ kind: 'set', setId: s.id });
                    }}
                    className={`px-2.5 py-2 flex items-center gap-2 cursor-pointer transition ${
                      isSetSelected
                        ? 'bg-sky-500/15 border-l-2 border-l-sky-400'
                        : 'hover:bg-slate-800/45 border-l-2 border-l-transparent'
                    }`}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setExpandedSets((prev) => {
                          const next = new Set(prev);
                          if (next.has(s.id)) next.delete(s.id);
                          else next.add(s.id);
                          return next;
                        });
                      }}
                      className="p-0.5 rounded hover:bg-slate-700/70 text-slate-400 shrink-0 cursor-pointer"
                    >
                      {isSetExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                    </button>
                    <Layers className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className={`text-xs font-bold truncate flex-1 ${isSetSelected ? 'text-white' : 'text-slate-200'}`}>
                      {s.name}
                    </span>
                    <span className="px-1.5 py-0.2 rounded bg-slate-800 text-[10px] font-semibold text-slate-300">
                      {s.movies.length}
                    </span>
                  </div>

                  {isSetExpanded && s.movies.length > 0 && (
                    <div className="bg-[#0a0f1a]/60">
                      {s.movies
                        .slice()
                        .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
                        .map((m) => {
                          const isMovSelected = selected?.kind === 'movie' && selected.movieId === m.id;
                          const matchedSetActor = actorNeedle ? findActorMatch(m.actors, actorNeedle) : null;
                          return (
                            <div
                              key={m.id}
                              onClick={() => onSelectMedia({ kind: 'movie', movieId: m.id })}
                              className={`pl-9 pr-2.5 py-1 flex items-center gap-2 cursor-pointer transition ${
                                isMovSelected
                                  ? 'bg-sky-500/20 border-l-2 border-l-sky-400 text-white'
                                  : 'hover:bg-slate-800/40 border-l-2 border-l-transparent text-slate-300'
                              }`}
                            >
                              <Clapperboard className="w-3 h-3 text-sky-400/80 shrink-0" />
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] truncate">{m.title}</div>
                                {matchedSetActor && (
                                  <div className="text-[9px] text-sky-300 truncate">
                                    as {matchedSetActor.role || 'Cast'}
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] text-slate-500">{m.year ?? '—'}</span>
                            </div>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })
          ))}
      </div>

      {/* Micro Legend Footer */}
      <div className="px-2.5 py-1.5 border-t border-slate-800/80 bg-[#0a0f1a] flex items-center justify-between text-[10px] text-slate-500">
        <span className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1">
            <FileCode2 className="w-2.5 h-2.5 text-emerald-400" /> NFO
          </span>
          <span className="inline-flex items-center gap-1">
            <Subtitles className="w-2.5 h-2.5 text-sky-400" /> Subs
          </span>
          <span className="inline-flex items-center gap-1">
            <Eye className="w-2.5 h-2.5 text-purple-400" /> Watched
          </span>
        </span>
        <span className="inline-flex items-center gap-1 text-slate-400">
          <Sparkles className="w-2.5 h-2.5 text-amber-400" /> Ready
        </span>
      </div>
    </aside>
  );
};

const EmptyListState: React.FC<{ text: string }> = ({ text }) => (
  <div className="p-6 text-center text-xs text-slate-500">{text}</div>
);
