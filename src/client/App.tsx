import React, { useCallback, useEffect, useState } from 'react';
import type { DashboardSummary, LibraryAuditReport, MovieRecord, MovieSetRecord, TvShowRecord } from '../shared/types.js';
import { Sidebar, type NavTab } from './components/Sidebar.js';
import { api } from './lib/api.js';
import { AuditPage } from './pages/AuditPage.js';
import { DashboardPage } from './pages/DashboardPage.js';
import { MoviesPage } from './pages/MoviesPage.js';
import { NfoInspectorPage } from './pages/NfoInspectorPage.js';
import { RenamerPage } from './pages/RenamerPage.js';
import { ScrapersPage } from './pages/ScrapersPage.js';
import { SetsPage } from './pages/SetsPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import { SubtitlesPage } from './pages/SubtitlesPage.js';
import { TvShowsPage } from './pages/TvShowsPage.js';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [movies, setMovies] = useState<MovieRecord[]>([]);
  const [shows, setShows] = useState<TvShowRecord[]>([]);
  const [sets, setSets] = useState<MovieSetRecord[]>([]);
  const [audit, setAudit] = useState<LibraryAuditReport | null>(null);
  const [scanning, setScanning] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const refreshAll = useCallback(async () => {
    const [d, m, s, st, au] = await Promise.all([
      api.getDashboard(),
      api.listMovies(),
      api.listShows(),
      api.listSets(),
      api.getAudit(),
    ]);
    setSummary(d);
    setMovies(m.movies);
    setShows(s.shows);
    setSets(st.sets);
    setAudit(au);
  }, []);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

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

  const issueCount = audit
    ? audit.issues.unscrapedMovies.length +
      audit.issues.unscrapedShows.length +
      audit.issues.missingMovieNfo.length +
      audit.issues.missingEpisodeNfo.length +
      audit.issues.duplicateMovies.length
    : 0;

  return (
    <div className="min-h-screen bg-[#0b0f17] text-slate-100 flex">
      <Sidebar
        activeTab={activeTab}
        onSelect={setActiveTab}
        counts={{
          movies: movies.length,
          shows: shows.length,
          sets: sets.length,
          subtitles: summary?.counts.subtitles ?? 0,
          issues: issueCount,
        }}
        scanning={scanning}
        onScanAll={handleScanAll}
      />

      <main className="flex-1 min-w-0 overflow-y-auto relative">
        {toast && (
          <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-sky-500 text-white text-xs font-bold shadow-xl shadow-sky-500/30">
            {toast}
          </div>
        )}

        {activeTab === 'dashboard' && (
          <DashboardPage
            summary={summary}
            busyAction={busyAction}
            onAutoScrapeAll={handleAutoScrapeAll}
            onDownloadMissingSubs={handleDownloadMissingSubs}
            onRegenerateNfos={handleRegenerateNfos}
            onNavigate={setActiveTab}
          />
        )}
        {activeTab === 'movies' && <MoviesPage movies={movies} onRefresh={refreshAll} />}
        {activeTab === 'tvshows' && <TvShowsPage shows={shows} onRefresh={refreshAll} />}
        {activeTab === 'sets' && <SetsPage sets={sets} movies={movies} onRefresh={refreshAll} />}
        {activeTab === 'scrapers' && <ScrapersPage onRefresh={refreshAll} />}
        {activeTab === 'subtitles' && <SubtitlesPage movies={movies} onRefresh={refreshAll} />}
        {activeTab === 'renamer' && <RenamerPage onRefresh={refreshAll} />}
        {activeTab === 'nfo' && <NfoInspectorPage onRefresh={refreshAll} />}
        {activeTab === 'audit' && <AuditPage onRefresh={refreshAll} />}
        {activeTab === 'settings' && <SettingsPage onRefresh={refreshAll} />}
      </main>
    </div>
  );
};

export default App;
