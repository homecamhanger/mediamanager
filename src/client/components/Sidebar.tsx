import React from 'react';
import {
  Activity,
  Clapperboard,
  Code2,
  FolderSync,
  Layers,
  LayoutDashboard,
  RefreshCw,
  SearchCheck,
  Settings,
  ShieldAlert,
  Subtitles,
  Tv,
} from 'lucide-react';

export type NavTab =
  | 'dashboard'
  | 'movies'
  | 'tvshows'
  | 'sets'
  | 'scrapers'
  | 'subtitles'
  | 'renamer'
  | 'nfo'
  | 'audit'
  | 'settings';

interface SidebarProps {
  activeTab: NavTab;
  onSelect: (tab: NavTab) => void;
  counts: {
    movies: number;
    shows: number;
    sets: number;
    subtitles: number;
    issues: number;
  };
  scanning: boolean;
  onScanAll: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ activeTab, onSelect, counts, scanning, onScanAll }) => {
  const navItems: Array<{ id: NavTab; label: string; icon: React.ReactNode; badge?: number; badgeTone?: 'sky' | 'amber' | 'rose' }> = [
    { id: 'dashboard', label: 'Overview', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'movies', label: 'Movies', icon: <Clapperboard className="w-4 h-4" />, badge: counts.movies, badgeTone: 'sky' },
    { id: 'tvshows', label: 'TV Shows', icon: <Tv className="w-4 h-4" />, badge: counts.shows, badgeTone: 'sky' },
    { id: 'sets', label: 'Movie Sets', icon: <Layers className="w-4 h-4" />, badge: counts.sets },
    { id: 'scrapers', label: 'Scrapers', icon: <SearchCheck className="w-4 h-4" /> },
    { id: 'subtitles', label: 'Subtitles', icon: <Subtitles className="w-4 h-4" />, badge: counts.subtitles },
    { id: 'renamer', label: 'Renamer', icon: <FolderSync className="w-4 h-4" /> },
    { id: 'nfo', label: 'NFO Inspector', icon: <Code2 className="w-4 h-4" /> },
    { id: 'audit', label: 'Library Audit', icon: <ShieldAlert className="w-4 h-4" />, badge: counts.issues, badgeTone: counts.issues > 0 ? 'amber' : undefined },
    { id: 'settings', label: 'Settings & Kodi', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <aside className="w-60 shrink-0 bg-[#0f1522] border-r border-slate-800/80 flex flex-col h-screen sticky top-0">
      <div className="px-4 py-4 border-b border-slate-800/80 flex items-center gap-3">
        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-sky-500/20">
          <Activity className="w-5 h-5 text-white" />
        </div>
        <div>
          <div className="font-bold text-slate-100 tracking-tight leading-none">KodiVault</div>
          <div className="text-[11px] text-sky-400/90 font-medium mt-1">Kodi Media Studio</div>
        </div>
      </div>

      <div className="p-3">
        <button
          onClick={onScanAll}
          disabled={scanning}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/30 text-sky-300 text-xs font-semibold transition cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} />
          {scanning ? 'Scanning Library...' : 'Scan All Sources'}
        </button>
      </div>

      <nav className="flex-1 px-2.5 py-1 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const active = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelect(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-medium transition cursor-pointer ${
                active
                  ? 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/60 border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5">
                {item.icon}
                <span>{item.label}</span>
              </span>
              {item.badge !== undefined && (
                <span
                  className={`text-[11px] px-1.5 py-0.5 rounded-md font-semibold ${
                    item.badgeTone === 'amber'
                      ? 'bg-amber-500/20 text-amber-300'
                      : active
                        ? 'bg-sky-500/30 text-sky-200'
                        : 'bg-slate-800 text-slate-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-between">
        <span>Kodi v21 Omega NFO</span>
        <span className="inline-flex items-center gap-1 text-emerald-400">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Ready
        </span>
      </div>
    </aside>
  );
};
