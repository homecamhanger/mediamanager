import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  BatchJob,
  DashboardSummary,
  LibraryAuditReport,
  MovieRecord,
  MovieSetRecord,
  SourceScanJob,
} from '../shared/types.js';
import { EpisodeDetailPanel } from './components/EpisodeDetailPanel.js';
import { MediaTreeSidebar } from './components/MediaTreeSidebar.js';
import { MovieDetailPanel } from './components/MovieDetailPanel.js';
import { SetDetailPanel } from './components/SetDetailPanel.js';
import { PlaylistsPage } from './pages/PlaylistsPage.js';
import { TopRibbon } from './components/TopRibbon.js';
import { TvShowDetailPanel } from './components/TvShowDetailPanel.js';
import { api } from './lib/api.js';
import {
  filterMoviesByActorAndQuery,
  filterSetsByActorAndQuery,
  filterShowTreeByActorAndQuery,
} from './lib/castFilter.js';
import type { LeftLibraryTab, RibbonTool, SelectedMedia, ShowTreeNode } from './lib/workspaceTypes.js';
import { AuditPage } from './pages/AuditPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { RenamerPage } from './pages/RenamerPage.js';
import { ScrapersPage } from './pages/ScrapersPage.js';
import { SettingsPage } from './pages/SettingsPage.js';

export const App: React.FC = () => {
  const [leftTab, setLeftTab] = useState<LeftLibraryTab>('movies');
  const [activeTool, setActiveTool] = useState<RibbonTool | null>(null);
  const [selected, setSelected] = useState<SelectedMedia>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [actorFilter, setActorFilter] = useState<string | null>(null);

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [showTree, setShowTree] = useState<ShowTreeNode[]>([]);
  const [sets, setSets] = useState<MovieSetRecord[]>([]);
  const [audit, setAudit] = useState<LibraryAuditReport | null>(null);

  const [scanning, setScanning] = useState(false);
  const [backgroundScanning, setBackgroundScanning] = useState(false);
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [scanJobs, setScanJobs] = useState<SourceScanJob[]>([]);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const prevRunningIdsRef = useRef<Set<string>>(new Set());

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const refreshAll = useCallback(async () => {
    const [d, m, stTree, st, au, jobsRes] = await Promise.all([
      api.getDashboard(),
      api.listMovies(),
      api.getShowsTree(),
      api.listSets(),
      api.getAudit(),
      api.listJobs().catch(() => ({ jobs: [] as BatchJob[], scanJobs: [] as SourceScanJob[] })),
    ]);
    setSummary(d);
    setMovies(m.movies);
    setShowTree(stTree.tree);
    setSets(st.sets);
    setAudit(au);
    setBatchJobs(jobsRes.jobs);
    setScanJobs(jobsRes.scanJobs);
    setBackgroundScanning(
      jobsRes.scanJobs.some((j) => j.status === 'running' || j.status === 'queued') ||
        jobsRes.jobs.some((j) => j.status === 'running')
    );

    // Initialize or repair selection when library changes
    setSelected((prev) => {
      if (prev?.kind === 'movie' && m.movies.some((mv) => mv.id === prev.movieId)) return prev;
      if (prev?.kind === 'show' && stTree.tree.some((n) => n.show.id === prev.showId)) return prev;
      if (
        prev?.kind === 'episode' &&
        stTree.tree.some((n) => n.show.id === prev.showId && n.episodes.some((ep) => ep.id === prev.episodeId))
      ) {
        return prev;
      }
      if (prev?.kind === 'set' && st.sets.some((s) => s.id === prev.setId)) return prev;

      if (m.movies.length > 0) return { kind: 'movie', movieId: m.movies[0].id };
      if (stTree.tree.length > 0) return { kind: 'show', showId: stTree.tree[0].show.id, seasonNumber: null };
      if (st.sets.length > 0) return { kind: 'set', setId: st.sets[0].id };
      return null;
    });
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const runningNow = new Set<string>([
      ...batchJobs.filter((j) => j.status === 'running').map((j) => j.jobId),
      ...scanJobs.filter((j) => j.status === 'running' || j.status === 'queued').map((j) => j.jobId),
    ]);
    const prevRunning = prevRunningIdsRef.current;

    let anyFinished = false;
    for (const oldId of prevRunning) {
      if (!runningNow.has(oldId)) {
        anyFinished = true;
        const doneBatch = batchJobs.find((j) => j.jobId === oldId);
        if (doneBatch) {
          showToast(
            doneBatch.status === 'cancelled'
              ? `${doneBatch.label} cancelled (${doneBatch.processedCount}/${doneBatch.totalCount})`
              : doneBatch.detail || `${doneBatch.label} finished`
          );
          setBusyAction(null);
        }
        const doneScan = scanJobs.find((j) => j.jobId === oldId);
        if (doneScan && doneScan.status === 'completed') {
          const summaryText =
            doneScan.mediaKind === 'movie'
              ? `${doneScan.moviesScanned} movie${doneScan.moviesScanned === 1 ? '' : 's'}`
              : `${doneScan.showsScanned} show${doneScan.showsScanned === 1 ? '' : 's'}, ${doneScan.episodesScanned} episode${doneScan.episodesScanned === 1 ? '' : 's'}`;
          showToast(`Finished scanning "${doneScan.sourceName}" (${summaryText})`);
        } else if (doneScan && doneScan.status === 'failed') {
          showToast(`Scan failed for "${doneScan.sourceName}"`);
        }
      }
    }
    prevRunningIdsRef.current = runningNow;
    if (anyFinished) {
      void refreshAll();
    }

    if (runningNow.size === 0) return;
    const id = setInterval(() => {
      void api.listJobs().then((res) => {
        setBatchJobs(res.jobs);
        setScanJobs(res.scanJobs);
        setBackgroundScanning(
          res.jobs.some((j) => j.status === 'running') ||
            res.scanJobs.some((j) => j.status === 'running' || j.status === 'queued')
        );
      });
    }, 650);
    return () => clearInterval(id);
  }, [batchJobs, scanJobs, refreshAll]);

  const handleScanAll = async () => {
    setScanning(true);
    try {
      const res = await api.scanSources();
      await refreshAll();
      showToast(`Scanned ${res.moviesScanned} movies, ${res.showsScanned} shows (${res.episodesScanned} episodes)`);
    } finally {
      setScanning(false);
    }
  };

  const handleAutoScrapeAll = async () => {
    setBusyAction('scrape');
    const { job } = await api.startBatchScrape('unscraped');
    setBatchJobs((prev) => [job, ...prev.filter((j) => j.jobId !== job.jobId)]);
    if (job.status !== 'running') {
      setBusyAction(null);
      await refreshAll();
      showToast(job.detail || 'Batch scrape finished');
    }
  };

  const handleDownloadMissingSubs = async () => {
    setBusyAction('subs');
    const { job } = await api.startBatchSubtitles();
    setBatchJobs((prev) => [job, ...prev.filter((j) => j.jobId !== job.jobId)]);
    if (job.status !== 'running') {
      setBusyAction(null);
      await refreshAll();
      showToast(job.detail || 'Missing subtitles check finished');
    }
  };

  const handleRegenerateNfos = async () => {
    setBusyAction('nfo');
    const { job } = await api.startBatchNfo('all');
    setBatchJobs((prev) => [job, ...prev.filter((j) => j.jobId !== job.jobId)]);
    if (job.status !== 'running') {
      setBusyAction(null);
      await refreshAll();
      showToast(job.detail || 'NFO sync finished');
    }
  };

  const handleCancelJob = async (jobId: string) => {
    const { job } = await api.cancelJob(jobId);
    setBatchJobs((prev) => prev.map((j) => (j.jobId === jobId ? job : j)));
  };

  const handleSelectMedia = (sel: SelectedMedia) => {
    setSelected(sel);
    setActiveTool(null);
    if (sel?.kind === 'movie') setLeftTab((curr) => (curr === 'sets' ? 'sets' : 'movies'));
    else if (sel?.kind === 'show' || sel?.kind === 'episode') setLeftTab('tvshows');
    else if (sel?.kind === 'set') setLeftTab('sets');
  };

  const handleFilterByActor = (actorName: string) => {
    const cleaned = actorName.trim();
    if (!cleaned) return;
    const needle = cleaned.toLowerCase();
    if (actorFilter?.trim().toLowerCase() === needle) {
      setActorFilter(null);
      showToast('Cleared cast filter');
      return;
    }

    setActorFilter(cleaned);
    setSidebarCollapsed(false);

    const movieHits = filterMoviesByActorAndQuery(movies, cleaned, '').length;
    const showHits = filterShowTreeByActorAndQuery(showTree, cleaned, '').length;
    const setHits = filterSetsByActorAndQuery(sets, cleaned, '').length;

    if (leftTab === 'movies' && movieHits === 0 && showHits > 0) setLeftTab('tvshows');
    else if (leftTab === 'tvshows' && showHits === 0 && movieHits > 0) setLeftTab('movies');
    else if (leftTab === 'sets' && setHits === 0) {
      if (movieHits > 0) setLeftTab('movies');
      else if (showHits > 0) setLeftTab('tvshows');
    }

    showToast(
      `Cast filter: ${cleaned} (${movieHits} movie${movieHits === 1 ? '' : 's'} · ${showHits} show${showHits === 1 ? '' : 's'})`
    );
  };

  const handleLeftTabChange = (tab: LeftLibraryTab) => {
    setLeftTab(tab);
    setActiveTool(null);

    // Keep selection aligned if user switches tabs and current selection is from a different kind (or doesn't match actorFilter)
    if (tab === 'movies' && movies.length > 0) {
      const matchingMovies = actorFilter ? filterMoviesByActorAndQuery(movies, actorFilter, '') : movies;
      const pool = matchingMovies.length > 0 ? matchingMovies : movies;
      const currentStillValid =
        selected?.kind === 'movie' && pool.some((m) => m.id === selected.movieId);
      if (!currentStillValid) {
        setSelected({ kind: 'movie', movieId: pool[0].id });
      }
    } else if (tab === 'tvshows' && showTree.length > 0) {
      const matchingShows = actorFilter
        ? filterShowTreeByActorAndQuery(showTree, actorFilter, '').map((m) => m.node)
        : showTree;
      const pool = matchingShows.length > 0 ? matchingShows : showTree;
      const currentStillValid =
        (selected?.kind === 'show' || selected?.kind === 'episode') &&
        pool.some((n) => n.show.id === selected.showId);
      if (!currentStillValid) {
        setSelected({ kind: 'show', showId: pool[0].show.id, seasonNumber: null });
      }
    } else if (tab === 'sets' && sets.length > 0) {
      const matchingSets = actorFilter ? filterSetsByActorAndQuery(sets, actorFilter, '') : sets;
      const pool = matchingSets.length > 0 ? matchingSets : sets;
      const currentStillValid = selected?.kind === 'set' && pool.some((s) => s.id === selected.setId);
      if (!currentStillValid) {
        setSelected({ kind: 'set', setId: pool[0].id });
      }
    }
  };

  const selectedLabel = useMemo(() => {
    if (!selected) return null;
    if (selected.kind === 'movie') {
      return movies.find((m) => m.id === selected.movieId)?.title ?? 'Movie';
    }
    if (selected.kind === 'show') {
      const node = showTree.find((n) => n.show.id === selected.showId);
      if (!node) return 'TV Show';
      return selected.seasonNumber != null ? `${node.show.title} · S${selected.seasonNumber}` : node.show.title;
    }
    if (selected.kind === 'episode') {
      const node = showTree.find((n) => n.show.id === selected.showId);
      const ep = node?.episodes.find((e) => e.id === selected.episodeId);
      if (!node || !ep) return 'Episode';
      return `${node.show.title} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
    }
    if (selected.kind === 'set') {
      return sets.find((s) => s.id === selected.setId)?.name ?? 'Movie Set';
    }
    return null;
  }, [selected, movies, showTree, sets]);

  const totalEpisodes = useMemo(
    () => showTree.reduce((acc, n) => acc + n.episodes.length, 0),
    [showTree]
  );

  const issueCount = audit
    ? audit.issues.unscrapedMovies.length +
      audit.issues.unscrapedShows.length +
      audit.issues.missingMovieNfo.length +
      audit.issues.missingEpisodeNfo.length +
      audit.issues.duplicateMovies.length +
      audit.issues.duplicateEpisodes.length +
      (audit.issues.missingEpisodes?.length ?? 0)
    : 0;

  const selectedSet = selected?.kind === 'set' ? sets.find((s) => s.id === selected.setId) ?? null : null;

  return (
    <div className="h-screen bg-[#0b0f17] text-slate-100 flex flex-col overflow-hidden">
      {/* Top Command & Tools/Settings Ribbon */}
      <TopRibbon
        summary={summary}
        activeTool={activeTool}
        onSelectTool={(t) => setActiveTool(t)}
        selectedLabel={selectedLabel}
        counts={{
          movies: movies.length,
          shows: showTree.length,
          episodes: totalEpisodes,
          sets: sets.length,
          subtitles: summary?.counts.subtitles ?? 0,
          issues: issueCount,
        }}
        scanning={scanning}
        backgroundScanning={backgroundScanning}
        batchJobs={batchJobs}
        scanJobs={scanJobs}
        busyAction={busyAction}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        onScanAll={handleScanAll}
        onAutoScrapeAll={handleAutoScrapeAll}
        onDownloadMissingSubs={handleDownloadMissingSubs}
        onRegenerateNfos={handleRegenerateNfos}
        onCancelJob={handleCancelJob}
      />

      {/* Split Workspace: Left Tabbed List/Tree + Right Inspector / Tool Workspace */}
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {!sidebarCollapsed && (
          <MediaTreeSidebar
            activeTab={leftTab}
            onTabChange={handleLeftTabChange}
            movies={movies}
            showTree={showTree}
            sets={sets}
            selected={selected}
            actorFilter={actorFilter}
            onClearActorFilter={() => {
              setActorFilter(null);
              showToast('Cleared cast filter');
            }}
            onSelectMedia={handleSelectMedia}
            onRefresh={refreshAll}
            onToast={showToast}
          />
        )}

        <main className="flex-1 min-w-0 min-h-0 flex flex-col bg-[#0b0f17] relative overflow-hidden">
          {toast && (
            <div className="fixed bottom-4 right-4 z-50 px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-bold shadow-xl shadow-sky-500/30">
              {toast}
            </div>
          )}

          {/* Active Ribbon Tool / Overview / Settings */}
          {activeTool ? (
            <div className="flex-1 overflow-y-auto">
              {activeTool === 'overview' && (
                <DashboardPage
                  summary={summary}
                  busyAction={busyAction}
                  onAutoScrapeAll={handleAutoScrapeAll}
                  onDownloadMissingSubs={handleDownloadMissingSubs}
                  onRegenerateNfos={handleRegenerateNfos}
                  onOpenTool={(t) => setActiveTool(t)}
                  onOpenLibraryTab={handleLeftTabChange}
                />
              )}
              {activeTool === 'renamer' && <RenamerPage onRefresh={refreshAll} />}
              {activeTool === 'playlists' && <PlaylistsPage onRefresh={refreshAll} />}
              {activeTool === 'audit' && (
                <AuditPage
                  onRefresh={refreshAll}
                  onOpenMovie={(movieId, focusTab) => handleSelectMedia({ kind: 'movie', movieId, focusTab })}
                  onOpenShow={(showId, focusTab) =>
                    handleSelectMedia({ kind: 'show', showId, seasonNumber: null, focusTab })
                  }
                  onOpenEpisode={(showId, episodeId, focusTab) =>
                    handleSelectMedia({ kind: 'episode', showId, episodeId, focusTab })
                  }
                />
              )}
              {activeTool === 'scrapers' && <ScrapersPage onRefresh={refreshAll} />}
              {activeTool === 'settings' && (
                <SettingsPage onRefresh={refreshAll} onOpenPlaylists={() => setActiveTool('playlists')} />
              )}
            </div>
          ) : selected?.kind === 'movie' ? (
            <MovieDetailPanel
              movieId={selected.movieId}
              initialTab={selected.focusTab}
              activeActor={actorFilter}
              onSelectActor={handleFilterByActor}
              onUpdated={refreshAll}
              onDeleted={() => {
                const next = movies.find((m) => m.id !== selected.movieId);
                setSelected(next ? { kind: 'movie', movieId: next.id } : null);
                showToast('Movie removed');
              }}
            />
          ) : selected?.kind === 'show' ? (
            <TvShowDetailPanel
              showId={selected.showId}
              selectedSeason={selected.seasonNumber ?? null}
              initialTab={selected.focusTab}
              activeActor={actorFilter}
              onSelectActor={handleFilterByActor}
              onSelectSeason={(seasonNumber) =>
                setSelected({ kind: 'show', showId: selected.showId, seasonNumber })
              }
              onSelectEpisode={(episodeId) =>
                setSelected({ kind: 'episode', showId: selected.showId, episodeId })
              }
              onUpdated={refreshAll}
            />
          ) : selected?.kind === 'episode' ? (
            <EpisodeDetailPanel
              showId={selected.showId}
              episodeId={selected.episodeId}
              initialTab={selected.focusTab}
              activeActor={actorFilter}
              onSelectActor={handleFilterByActor}
              onSelectShow={(showId, seasonNumber) =>
                setSelected({ kind: 'show', showId, seasonNumber: seasonNumber ?? null })
              }
              onUpdated={refreshAll}
              onDeleted={() => {
                setSelected({ kind: 'show', showId: selected.showId, seasonNumber: null });
                showToast('Episode removed');
              }}
            />
          ) : selectedSet ? (
            <SetDetailPanel
              setRecord={selectedSet}
              allMovies={movies}
              onSelectMovie={(movieId) => handleSelectMedia({ kind: 'movie', movieId })}
              onUpdated={refreshAll}
              onDeleted={() => {
                setSelected(sets.find((s) => s.id !== selectedSet.id) ? { kind: 'set', setId: sets.find((s) => s.id !== selectedSet.id)!.id } : null);
              }}
            />
          ) : (
            <div className="flex-1 overflow-y-auto">
              <DashboardPage
                summary={summary}
                busyAction={busyAction}
                onAutoScrapeAll={handleAutoScrapeAll}
                onDownloadMissingSubs={handleDownloadMissingSubs}
                onRegenerateNfos={handleRegenerateNfos}
                onOpenTool={(t) => setActiveTool(t)}
                onOpenLibraryTab={handleLeftTabChange}
              />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default App;
