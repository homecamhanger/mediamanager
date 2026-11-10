import React from 'react';
import {
  Activity,
  ArrowLeft,
  FileCode2,
  FolderSync,
  Languages,
  LayoutDashboard,
  Loader2,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  SearchCheck,
  Settings,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { BatchJob, DashboardSummary, SourceScanJob } from '../../shared/types.js';
import type { RibbonTool } from '../lib/workspaceTypes.js';

interface TopRibbonProps {
  summary: DashboardSummary | null;
  activeTool: RibbonTool | null;
  onSelectTool: (tool: RibbonTool | null) => void;
  selectedLabel: string | null;
  counts: {
    movies: number;
    shows: number;
    episodes: number;
    sets: number;
    subtitles: number;
    issues: number;
  };
  scanning: boolean;
  backgroundScanning: boolean;
  batchJobs?: BatchJob[];
  scanJobs?: SourceScanJob[];
  busyAction: string | null;
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onScanAll: () => void;
  onAutoScrapeAll: () => void;
  onDownloadMissingSubs: () => void;
  onRegenerateNfos: () => void;
  onCancelJob?: (jobId: string) => void;
}

export const TopRibbon: React.FC<TopRibbonProps> = ({
  summary,
  activeTool,
  onSelectTool,
  selectedLabel,
  counts,
  scanning,
  backgroundScanning,
  batchJobs = [],
  scanJobs = [],
  busyAction,
  sidebarCollapsed,
  onToggleSidebar,
  onScanAll,
  onAutoScrapeAll,
  onDownloadMissingSubs,
  onRegenerateNfos,
  onCancelJob,
}) => {
  const health = summary?.healthScore ?? 100;

  const toggleTool = (tool: RibbonTool) => {
    if (activeTool === tool && selectedLabel) {
      onSelectTool(null);
    } else {
      onSelectTool(tool);
    }
  };

  const toolBtn = (
    id: RibbonTool,
    label: string,
    icon: React.ReactNode,
    badge?: number,
    badgeTone?: 'amber' | 'sky',
    spinning?: boolean
  ) => {
    const active = activeTool === id;
    return (
      <button
        key={id}
        onClick={() => toggleTool(id)}
        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap border ${
          active
            ? 'bg-sky-500/20 text-sky-200 border-sky-500/50 shadow-sm'
            : 'bg-slate-900/70 text-slate-300 border-slate-800 hover:bg-slate-800 hover:text-white'
        }`}
      >
        {spinning ? <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" /> : icon}
        <span>{label}</span>
        {badge !== undefined && badge > 0 && (
          <span
            className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
              badgeTone === 'amber' ? 'bg-amber-500/25 text-amber-300' : 'bg-sky-500/25 text-sky-300'
            }`}
          >
            {badge}
          </span>
        )}
      </button>
    );
  };

  return (
    <header className="bg-[#0e1420] border-b border-slate-800/90 shrink-0 z-30">
      {/* Upper Command Bar: Brand, Live Telemetry, Batch Actions */}
      <div className="px-3 py-1.5 border-b border-slate-800/70 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? 'Show library list' : 'Hide library list'}
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 cursor-pointer"
          >
            {sidebarCollapsed ? <PanelLeftOpen className="w-3.5 h-3.5" /> : <PanelLeftClose className="w-3.5 h-3.5" />}
          </button>

          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-sky-500 to-indigo-600 flex items-center justify-center shadow shadow-sky-500/20">
              <Activity className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-sm text-white tracking-tight">KodiVault</span>
            <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-slate-800/90 border border-slate-700/80 text-[10px] font-mono text-sky-300">
              Kodi v21
            </span>
          </div>

          {/* Dense Telemetry Strip */}
          <div className="hidden xl:flex items-center gap-1.5 pl-2 ml-1 border-l border-slate-800 text-[11px] text-slate-400">
            <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800/80">
              <strong className="text-slate-200">{counts.movies}</strong> Movies
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800/80">
              <strong className="text-slate-200">{counts.shows}</strong> Shows / <strong className="text-slate-200">{counts.episodes}</strong> Eps
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800/80">
              <strong className="text-slate-200">{counts.sets}</strong> Sets
            </span>
            <span className="px-2 py-0.5 rounded bg-slate-900/90 border border-slate-800/80">
              <strong className="text-slate-200">{counts.subtitles}</strong> Subs
            </span>
          </div>

          <button
            onClick={() => toggleTool('audit')}
            className={`px-2 py-0.5 rounded-lg border flex items-center gap-1.5 text-[11px] cursor-pointer transition ${
              activeTool === 'audit'
                ? 'bg-sky-500/20 border-sky-500/50 text-sky-200 shadow-sm'
                : health >= 85
                  ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                  : 'bg-amber-500/10 border-amber-500/30 text-amber-300 hover:bg-amber-500/20'
            }`}
            title={activeTool === 'audit' && selectedLabel ? 'Return to selected item' : 'Open Library Audit'}
          >
            <ShieldCheck className="w-3 h-3" />
            <span>
              Health <strong>{health}%</strong>
            </span>
            {counts.issues > 0 && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/25 text-amber-300 text-[10px] font-bold">
                {counts.issues}
              </span>
            )}
          </button>
        </div>

        {/* Global Batch & Library Actions */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <button
            onClick={onScanAll}
            disabled={scanning}
            className="px-2.5 py-1 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-500/35 text-sky-300 text-[11px] font-semibold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${scanning ? 'animate-spin' : ''}`} />
            {scanning ? 'Scanning...' : 'Scan All'}
          </button>
          <button
            onClick={onAutoScrapeAll}
            disabled={Boolean(busyAction)}
            className="px-2.5 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Sparkles className="w-3 h-3" />
            {busyAction === 'scrape' ? 'Scraping...' : 'Auto-Scrape'}
          </button>
          <button
            onClick={onDownloadMissingSubs}
            disabled={Boolean(busyAction)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <Languages className="w-3 h-3 text-sky-400" />
            {busyAction === 'subs' ? 'Fetching...' : 'Fetch Subs'}
          </button>
          <button
            onClick={onRegenerateNfos}
            disabled={Boolean(busyAction)}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50"
          >
            <FileCode2 className="w-3 h-3 text-emerald-400" />
            {busyAction === 'nfo' ? 'Syncing...' : 'Sync NFOs'}
          </button>
        </div>
      </div>

      {/* Lower Ribbon: Categorized Tools & Settings */}
      <div className="px-3 py-1.5 flex items-center justify-between gap-3 overflow-x-auto bg-[#0b101b]">
        <div className="flex items-center gap-3 min-w-0">
          {/* Overview */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-0.5">View</span>
            {toolBtn('overview', 'Overview', <LayoutDashboard className="w-3.5 h-3.5 text-sky-400" />)}
          </div>

          <div className="h-5 w-px bg-slate-800 shrink-0" />

          {/* Tools Group */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-0.5">Tools</span>
            {toolBtn('renamer', 'Renamer', <FolderSync className="w-3.5 h-3.5 text-emerald-400" />)}
          </div>

          <div className="h-5 w-px bg-slate-800 shrink-0" />

          {/* Settings Group */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mr-0.5">Settings</span>
            {toolBtn('scrapers', 'Scrapers', <SearchCheck className="w-3.5 h-3.5 text-purple-400" />)}
            {toolBtn(
              'settings',
              backgroundScanning ? 'Sources & Kodi (Scanning)' : 'Sources & Kodi',
              <Settings className="w-3.5 h-3.5 text-slate-300" />,
              undefined,
              undefined,
              backgroundScanning
            )}
          </div>
        </div>

        {/* Return to Selected Media button when inspecting a tool */}
        {activeTool && selectedLabel && (
          <button
            onClick={() => onSelectTool(null)}
            className="shrink-0 px-2.5 py-1 rounded-lg bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/40 text-indigo-200 text-[11px] font-semibold flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3 h-3" />
            <span className="max-w-[180px] truncate">{selectedLabel}</span>
          </button>
        )}
      </div>

      {/* Unified Live Background Job Strip */}
      {(batchJobs.some((j) => j.status === 'running') ||
        scanJobs.some((j) => j.status === 'running' || j.status === 'queued')) && (
        <div className="px-3 py-1.5 border-t border-slate-800/80 bg-[#0d1525] flex flex-col gap-1.5">
          {batchJobs
            .filter((j) => j.status === 'running')
            .map((job) => (
              <div key={job.jobId} className="flex flex-wrap items-center gap-2.5 text-[11px]">
                <span className="px-1.5 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 font-bold uppercase text-[10px]">
                  {job.kind}
                </span>
                <span className="font-semibold text-slate-100">{job.label}</span>
                {job.currentItem && (
                  <span className="text-slate-400 truncate max-w-[260px]">{job.currentItem}</span>
                )}
                <div className="flex-1 min-w-[120px] max-w-xs h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-sky-500 to-indigo-400 transition-all duration-300"
                    style={{ width: `${Math.max(4, job.overallPercent)}%` }}
                  />
                </div>
                <span className="font-mono text-slate-300 shrink-0">
                  {job.processedCount}/{job.totalCount} ({job.overallPercent}%)
                </span>
                {onCancelJob && (
                  <button
                    type="button"
                    disabled={job.cancelRequested}
                    onClick={() => onCancelJob(job.jobId)}
                    className="px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/30 border border-rose-500/40 text-rose-300 text-[10px] font-semibold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                  >
                    <X className="w-3 h-3" />
                    {job.cancelRequested ? 'Cancelling...' : 'Cancel'}
                  </button>
                )}
              </div>
            ))}

          {scanJobs
            .filter((j) => j.status === 'running' || j.status === 'queued')
            .map((sj) => (
              <div key={sj.jobId} className="flex flex-wrap items-center gap-2.5 text-[11px]">
                <span
                  className={`px-1.5 py-0.5 rounded border font-bold uppercase text-[10px] ${
                    sj.status === 'queued'
                      ? 'bg-slate-700/40 border-slate-600/50 text-slate-300'
                      : 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  }`}
                >
                  {sj.status === 'queued' ? 'QUEUED' : 'SCAN'}
                </span>
                <span className="font-semibold text-slate-100">
                  {sj.status === 'queued' ? `Queued: ${sj.sourceName}` : `Scanning ${sj.sourceName}`}
                </span>
                {sj.currentItem && (
                  <span className="text-slate-400 truncate max-w-[240px]">{sj.currentItem}</span>
                )}
                <div className="flex-1 min-w-[120px] max-w-xs h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${
                      sj.status === 'queued' ? 'bg-slate-500' : 'bg-amber-400'
                    }`}
                    style={{ width: `${Math.max(5, sj.overallPercent)}%` }}
                  />
                </div>
                <span className="font-mono text-slate-300 shrink-0">{sj.overallPercent}%</span>
              </div>
            ))}
        </div>
      )}
    </header>
  );
};
