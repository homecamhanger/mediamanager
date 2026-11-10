import React from 'react';
import {
  Activity,
  CheckCircle2,
  Clapperboard,
  FileCode2,
  FolderSync,
  Languages,
  Layers,
  ShieldCheck,
  Sparkles,
  Subtitles,
  Tv,
} from 'lucide-react';
import type { DashboardSummary } from '../../shared/types.js';
import type { NavTab } from '../components/Sidebar.js';

interface DashboardPageProps {
  summary: DashboardSummary | null;
  busyAction: string | null;
  onAutoScrapeAll: () => void;
  onDownloadMissingSubs: () => void;
  onRegenerateNfos: () => void;
  onNavigate: (tab: NavTab) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  summary,
  busyAction,
  onAutoScrapeAll,
  onDownloadMissingSubs,
  onRegenerateNfos,
  onNavigate,
}) => {
  if (!summary) {
    return <div className="p-8 text-sm text-slate-400">Loading library telemetry...</div>;
  }

  const { counts, qualityDistribution, genreDistribution, sourceStatuses, recentActivity, healthScore } = summary;
  const maxQuality = Math.max(1, ...qualityDistribution.map((q) => q.count));
  const maxGenre = Math.max(1, ...genreDistribution.map((g) => g.count));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Library Command Center</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Kodi-ready metadata coverage, multi-source scraper health, subtitle status, and quick automation.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={onAutoScrapeAll}
            disabled={Boolean(busyAction)}
            className="px-3.5 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-4 h-4" />
            {busyAction === 'scrape' ? 'Scraping...' : 'Auto-Scrape Unscraped'}
          </button>
          <button
            onClick={onDownloadMissingSubs}
            disabled={Boolean(busyAction)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Languages className="w-4 h-4 text-sky-400" />
            {busyAction === 'subs' ? 'Fetching Subs...' : 'Download Missing Subs'}
          </button>
          <button
            onClick={onRegenerateNfos}
            disabled={Boolean(busyAction)}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <FileCode2 className="w-4 h-4 text-emerald-400" />
            {busyAction === 'nfo' ? 'Writing NFOs...' : 'Sync All NFOs'}
          </button>
          <button
            onClick={() => onNavigate('renamer')}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <FolderSync className="w-4 h-4 text-amber-400" />
            Batch Renamer
          </button>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <StatCard
          title="Movies"
          value={counts.movies}
          sub={`${counts.scrapedMovies}/${counts.movies} scraped • ${counts.moviesWithNfo} NFO`}
          icon={<Clapperboard className="w-5 h-5 text-sky-400" />}
          onClick={() => onNavigate('movies')}
        />
        <StatCard
          title="TV Shows"
          value={counts.shows}
          sub={`${counts.episodes} episodes • ${counts.scrapedShows}/${counts.shows} scraped`}
          icon={<Tv className="w-5 h-5 text-indigo-400" />}
          onClick={() => onNavigate('tvshows')}
        />
        <StatCard
          title="Movie Sets"
          value={counts.sets}
          sub="Kodi <set> collections"
          icon={<Layers className="w-5 h-5 text-amber-400" />}
          onClick={() => onNavigate('sets')}
        />
        <StatCard
          title="Subtitles"
          value={counts.subtitles}
          sub="Sidecar SRT/ASS/VTT files"
          icon={<Subtitles className="w-5 h-5 text-emerald-400" />}
          onClick={() => onNavigate('subtitles')}
        />
        <StatCard
          title="Health Score"
          value={`${healthScore}%`}
          sub={healthScore >= 85 ? 'Kodi Ready' : 'Items need attention'}
          icon={<ShieldCheck className={`w-5 h-5 ${healthScore >= 80 ? 'text-emerald-400' : 'text-amber-400'}`} />}
          onClick={() => onNavigate('audit')}
        />
      </div>

      {/* Coverage & Scraper Status */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-100">Kodi Artwork & Metadata Coverage</h3>
          <div className="space-y-3 text-xs">
            <ProgressBar label="Scraped Metadata" value={counts.scrapedMovies} max={counts.movies} color="bg-sky-500" />
            <ProgressBar label="Valid NFO Files" value={counts.moviesWithNfo} max={counts.movies} color="bg-emerald-500" />
            <ProgressBar label="Posters (2:3)" value={counts.moviesWithPoster} max={counts.movies} color="bg-indigo-500" />
            <ProgressBar label="1080p Fanart Backdrops" value={counts.moviesWithFanart} max={counts.movies} color="bg-amber-500" />
            <ProgressBar label="HD ClearLOGO PNGs" value={counts.moviesWithClearlogo} max={counts.movies} color="bg-purple-500" />
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
          <h3 className="text-sm font-bold text-slate-100">Video Quality & Top Genres</h3>
          <div className="space-y-2.5 text-xs">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Resolutions</div>
            {qualityDistribution.map((q) => (
              <div key={q.label} className="flex items-center gap-2">
                <span className="w-14 font-mono text-slate-300">{q.label}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-amber-400 rounded-full" style={{ width: `${(q.count / maxQuality) * 100}%` }} />
                </div>
                <span className="w-6 text-right text-slate-400">{q.count}</span>
              </div>
            ))}
          </div>
          <div className="space-y-2 text-xs pt-2 border-t border-slate-800">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Genres</div>
            {genreDistribution.slice(0, 5).map((g) => (
              <div key={g.genre} className="flex items-center gap-2">
                <span className="w-28 truncate text-slate-300">{g.genre}</span>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-sky-400 rounded-full" style={{ width: `${(g.count / maxGenre) * 100}%` }} />
                </div>
                <span className="w-6 text-right text-slate-400">{g.count}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100">Active Scraper Sources</h3>
            <button onClick={() => onNavigate('scrapers')} className="text-xs text-sky-400 hover:underline cursor-pointer">
              Configure
            </button>
          </div>
          <div className="space-y-2">
            {sourceStatuses.map((s) => (
              <div key={s.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-900/70 border border-slate-800/80 text-xs">
                <div className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full ${s.enabled ? 'bg-emerald-400' : 'bg-slate-600'}`} />
                  <span className="text-slate-200 font-medium truncate">{s.name.split('(')[0].trim()}</span>
                </div>
                <span className="text-[11px] text-slate-400 shrink-0">{s.enabled ? s.mode : 'Disabled'}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Activity Feed */}
      <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-slate-100">
          <Activity className="w-4 h-4 text-sky-400" /> Recent Library Activity
        </div>
        {recentActivity.length === 0 ? (
          <div className="text-xs text-slate-500 py-4">No recent actions logged yet.</div>
        ) : (
          <div className="divide-y divide-slate-800/70">
            {recentActivity.map((a) => (
              <div key={a.id} className="py-2.5 flex items-center justify-between gap-4 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <CheckCircle2
                    className={`w-3.5 h-3.5 shrink-0 ${
                      a.status === 'success' ? 'text-emerald-400' : a.status === 'warning' ? 'text-amber-400' : 'text-sky-400'
                    }`}
                  />
                  <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase text-[10px] font-bold">{a.category}</span>
                  <span className="font-semibold text-slate-200 shrink-0">{a.action}:</span>
                  <span className="text-slate-400 truncate">{a.message}</span>
                </div>
                <span className="text-[11px] text-slate-500 shrink-0">{new Date(a.createdAt).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const StatCard: React.FC<{
  title: string;
  value: number | string;
  sub: string;
  icon: React.ReactNode;
  onClick: () => void;
}> = ({ title, value, sub, icon, onClick }) => (
  <button
    onClick={onClick}
    className="p-4 rounded-2xl bg-[#111827] border border-slate-800 hover:border-sky-500/40 text-left transition cursor-pointer group"
  >
    <div className="flex items-center justify-between">
      <span className="text-xs font-semibold text-slate-400">{title}</span>
      <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 group-hover:border-sky-500/30">{icon}</div>
    </div>
    <div className="text-2xl font-extrabold text-white mt-2">{value}</div>
    <div className="text-[11px] text-slate-400 mt-1 truncate">{sub}</div>
  </button>
);

const ProgressBar: React.FC<{ label: string; value: number; max: number; color: string }> = ({ label, value, max, color }) => {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-slate-300">
        <span>{label}</span>
        <span className="font-mono text-slate-400">
          {value}/{max} ({pct}%)
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
};
