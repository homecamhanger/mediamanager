import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { DashboardSummary, LibraryAuditReport, MovieRecord, MovieSetRecord } from '../shared/types.js';
import { EpisodeDetailPanel } from './components/EpisodeDetailPanel.js';
import { MediaTreeSidebar } from './components/MediaTreeSidebar.js';
import { MovieDetailPanel } from './components/MovieDetailPanel.js';
import { SetDetailPanel } from './components/SetDetailPanel.js';
import { TopRibbon } from './components/TopRibbon.js';
import { TvShowDetailPanel } from './components/TvShowDetailPanel.js';
import { api } from './lib/api.js';
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

  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [showTree, setShowTree] = useState<ShowTreeNode[]>([]);
  const [sets, setSets] = useState<MovieSetRecord[]>([]);
  const [audit, setAudit] = useState<LibraryAuditReport | null>(null);

  const [scanning, setScanning] = useState(false);
  const [backgroundScanning, setBackgroundScanning] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

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
      api.listScanJobs().catch(() => ({ jobs: [] })),
    ]);
    setSummary(d);
    setMovies(m.movies);
    setShowTree(stTree.tree);
    setSets(st.sets);
    setAudit(au);
    setBackgroundScanning(jobsRes.jobs.some((j) => j.status === 'running'));

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
    if (!backgroundScanning) return;
    const id = setInterval(() => {
      void refreshAll();
    }, 1500);
    return () => clearInterval(id);
  }, [backgroundScanning, refreshAll]);

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
    try {
      const res = await api.batchScrape({ onlyUnscraped: true });
      await refreshAll();
      showToast(`Scraped ${res.scrapedMovies} movies and ${res.scrapedShows} TV shows`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleDownloadMissingSubs = async () => {
    setBusyAction('subs');
    try {
      const res = await api.batchMissingSubtitles({});
      await refreshAll();
      showToast(`Downloaded ${res.downloaded} missing subtitle files`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleRegenerateNfos = async () => {
    setBusyAction('nfo');
    try {
      const res = await api.regenerateNfos({ scope: 'all' });
      await refreshAll();
      showToast(`Synced ${res.written} Kodi NFO files to disk`);
    } finally {
      setBusyAction(null);
    }
  };

  const handleSelectMedia = (sel: SelectedMedia) => {
    setSelected(sel);
    setActiveTool(null);
    if (sel?.kind === 'movie') setLeftTab((curr) => (curr === 'sets' ? 'sets' : 'movies'));
    else if (sel?.kind === 'show' || sel?.kind === 'episode') setLeftTab('tvshows');
    else if (sel?.kind === 'set') setLeftTab('sets');
  };

  const handleLeftTabChange = (tab: LeftLibraryTab) => {
    setLeftTab(tab);
    setActiveTool(null);
    // Keep selection aligned if user switches tabs and current selection is from a different kind
    if (tab === 'movies' && selected?.kind !== 'movie' && movies.length > 0) {
      setSelected({ kind: 'movie', movieId: movies[0].id });
    } else if (tab === 'tvshows' && selected?.kind !== 'show' && selected?.kind !== 'episode' && showTree.length > 0) {
      setSelected({ kind: 'show', showId: showTree[0].show.id, seasonNumber: null });
    } else if (tab === 'sets' && selected?.kind !== 'set' && sets.length > 0) {
      setSelected({ kind: 'set', setId: sets[0].id });
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
      audit.issues.duplicateMovies.length
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
        busyAction={busyAction}
        sidebarCollapsed={sidebarCollapsed}
        onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
        onScanAll={handleScanAll}
        onAutoScrapeAll={handleAutoScrapeAll}
        onDownloadMissingSubs={handleDownloadMissingSubs}
        onRegenerateNfos={handleRegenerateNfos}
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
              {activeTool === 'settings' && <SettingsPage onRefresh={refreshAll} />}
            </div>
          ) : selected?.kind === 'movie' ? (
            <MovieDetailPanel
              movieId={selected.movieId}
              initialTab={selected.focusTab}
              onUpdated={refreshAll}
            />
          ) : selected?.kind === 'show' ? (
            <TvShowDetailPanel
              showId={selected.showId}
              selectedSeason={selected.seasonNumber ?? null}
              initialTab={
                selected.focusTab === 'nfo' || selected.focusTab === 'artwork'
                  ? selected.focusTab
                  : undefined
              }
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
              initialTab={
                selected.focusTab === 'nfo' || selected.focusTab === 'subtitles'
                  ? selected.focusTab
                  : undefined
              }
              onSelectShow={(showId, seasonNumber) =>
                setSelected({ kind: 'show', showId, seasonNumber: seasonNumber ?? null })
              }
              onUpdated={refreshAll}
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
