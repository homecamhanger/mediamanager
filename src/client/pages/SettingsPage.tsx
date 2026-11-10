import React, { useEffect, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Download,
  FolderOpen,
  FolderPlus,
  HardDrive,
  KeyRound,
  ListMusic,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings,
  Subtitles,
  Trash2,
  X,
} from 'lucide-react';
import type { AppPreferences, ArtworkKind, KodiRpcConfig, KodiSyncResult, MediaSource, SourceScanJob } from '../../shared/types.js';
import { FolderBrowserModal } from '../components/FolderBrowserModal.js';
import { api } from '../lib/api.js';

const ALL_ARTWORK_KINDS: ArtworkKind[] = ['poster', 'fanart', 'clearlogo', 'clearart', 'disc', 'banner', 'landscape'];

export const SettingsPage: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [prefs, setPrefs] = useState<AppPreferences | null>(null);
  const [kodi, setKodi] = useState<KodiRpcConfig | null>(null);
  const [subCfg, setSubCfg] = useState({
    openSubtitlesApiKey: '',
    openSubtitlesUsername: '',
    openSubtitlesPassword: '',
    subdlApiKey: '',
    useDemoFallback: true,
  });

  // Add source form
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newKind, setNewKind] = useState<'movie' | 'tvshow'>('movie');
  const [browseOpen, setBrowseOpen] = useState(false);

  // Live source scan job tracking (supports multiple queued / running jobs)
  const [scanJobs, setScanJobs] = useState<SourceScanJob[]>([]);
  const [dismissedJobIds, setDismissedJobIds] = useState<Set<string>>(() => new Set());
  const prevJobStatusRef = useRef<Map<string, SourceScanJob['status']>>(new Map());
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  // Smart playlist & sources XML
  const [playlistName, setPlaylistName] = useState('Top Rated 4K Movies');
  const [playlistGenre, setPlaylistGenre] = useState('');
  const [playlistMinRating, setPlaylistMinRating] = useState('8.0');
  const [playlist4k, setPlaylist4k] = useState(true);
  const [generatedXml, setGeneratedXml] = useState('');

  const [msg, setMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [kodiSyncBusy, setKodiSyncBusy] = useState<'pull' | 'push' | null>(null);
  const [kodiSyncResult, setKodiSyncResult] = useState<KodiSyncResult | null>(null);
  const [newMapLocal, setNewMapLocal] = useState('');
  const [newMapKodi, setNewMapKodi] = useState('');

  const loadSourcesOnly = async () => {
    const sRes = await api.listSources();
    setSources(sRes.sources);
  };

  const applyJobSnapshot = (jobs: SourceScanJob[]) => {
    const prevMap = prevJobStatusRef.current;
    let completedOrFailed = false;

    for (const job of jobs) {
      const prevStatus = prevMap.get(job.jobId);
      if (prevStatus === 'running' || prevStatus === 'queued') {
        if (job.status === 'completed') {
          completedOrFailed = true;
          const summary =
            job.mediaKind === 'movie'
              ? `${job.moviesScanned} movie${job.moviesScanned === 1 ? '' : 's'}`
              : `${job.showsScanned} show${job.showsScanned === 1 ? '' : 's'} & ${job.episodesScanned} episode${job.episodesScanned === 1 ? '' : 's'}`;
          notify(`Source "${job.sourceName}" indexed (${summary})`);
        } else if (job.status === 'failed') {
          completedOrFailed = true;
          setErrorMsg(`Scan failed for "${job.sourceName}": ${job.error || 'Unknown error'}`);
        }
      }
      prevMap.set(job.jobId, job.status);
    }

    setScanJobs(jobs);
    if (completedOrFailed) {
      void loadSourcesOnly();
      onRefreshRef.current();
    }
  };

  const load = async () => {
    const [sRes, pRes, kRes, jRes, subRes] = await Promise.all([
      api.listSources(),
      api.getPreferences(),
      api.getKodiConfig(),
      api.listScanJobs(),
      api.getSubtitleConfig(),
    ]);
    setSources(sRes.sources);
    setPrefs(pRes);
    setKodi(kRes);
    setSubCfg(subRes);

    // Seed status tracking for existing jobs and avoid resurrecting stale finished banners on mount
    const initiallyFinished = new Set<string>();
    for (const job of jRes.jobs) {
      prevJobStatusRef.current.set(job.jobId, job.status);
      if (job.status === 'completed' || job.status === 'failed') {
        initiallyFinished.add(job.jobId);
      }
    }
    setDismissedJobIds((prev) => {
      const next = new Set(prev);
      for (const id of initiallyFinished) next.add(id);
      return next;
    });
    setScanJobs(jRes.jobs);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const hasActiveScan = scanJobs.some((j) => j.status === 'running' || j.status === 'queued');

  useEffect(() => {
    if (!hasActiveScan) return;
    const poll = () => {
      void api
        .listScanJobs()
        .then((res) => applyJobSnapshot(res.jobs))
        .catch(() => {
          // ignore transient poll failures
        });
    };
    const timer = window.setInterval(poll, 250);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveScan]);

  const notify = (text: string) => {
    setErrorMsg(null);
    setMsg(text);
    setTimeout(() => setMsg(null), 4000);
  };

  const trackStartedJob = (job: SourceScanJob) => {
    prevJobStatusRef.current.set(job.jobId, job.status);
    setDismissedJobIds((prev) => {
      const next = new Set(prev);
      next.delete(job.jobId);
      return next;
    });
    setScanJobs((prev) => [job, ...prev.filter((j) => j.jobId !== job.jobId)]);
    onRefreshRef.current();
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPath.trim()) {
      setErrorMsg('Please provide both a source label and folder path.');
      return;
    }
    setBusy(true);
    setErrorMsg(null);
    try {
      const res = await api.addSource({
        name: newName.trim(),
        path: newPath.trim(),
        mediaKind: newKind,
        nfoNaming: prefs?.defaultNfoNaming ?? 'movie.nfo',
        artworkNaming: prefs?.defaultArtworkNaming ?? 'folder',
        asyncScan: true,
      });
      setNewName('');
      setNewPath('');
      // Immediately reflect newly added source in the list
      setSources((prev) => (prev.some((s) => s.id === res.source.id) ? prev : [...prev, res.source]));
      if (res.job) {
        trackStartedJob(res.job);
      } else {
        await loadSourcesOnly();
        onRefresh();
        notify('Media source added');
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleScanSingleSource = async (s: MediaSource) => {
    setErrorMsg(null);
    try {
      const res = await api.scanSources(s.id, true);
      if (res.job) {
        trackStartedJob(res.job);
      } else {
        onRefresh();
        notify(`Rescanned "${s.name}"`);
      }
    } catch (err) {
      setErrorMsg((err as Error).message);
    }
  };

  const handleSavePrefs = async () => {
    if (!prefs) return;
    await api.savePreferences(prefs);
    notify('Kodi preferences saved');
  };

  const handleSaveKodi = async () => {
    if (!kodi) return;
    await api.saveKodiConfig(kodi);
    notify('Kodi JSON-RPC settings saved');
  };

  const handleTestKodi = async () => {
    if (!kodi) return;
    await api.saveKodiConfig(kodi);
    const res = await api.testKodiRpc();
    await load();
    notify(res.ok ? 'Connected to Kodi JSON-RPC!' : `Kodi connection check: ${res.status}`);
  };

  const handleKodiSync = async (direction: 'pull' | 'push') => {
    if (!kodi) return;
    setKodiSyncBusy(direction);
    setErrorMsg(null);
    try {
      await api.saveKodiConfig(kodi);
      const res = await api.syncKodi(direction);
      setKodiSyncResult(res);
      if (direction === 'pull' && (res.updatedMovies > 0 || res.updatedEpisodes > 0)) {
        onRefresh();
      }
      if (res.errors.length > 0 && res.matchedMovies + res.matchedEpisodes === 0) {
        setErrorMsg(`Kodi sync error: ${res.errors[0]}`);
      } else {
        notify(
          direction === 'pull'
            ? `Pulled ${res.updatedMovies} movie & ${res.updatedEpisodes} episode updates from Kodi`
            : `Pushed ${res.updatedMovies} movie & ${res.updatedEpisodes} episode updates to Kodi`
        );
      }
    } finally {
      setKodiSyncBusy(null);
    }
  };

  const handleAddPathMapping = () => {
    if (!kodi || !newMapLocal.trim() || !newMapKodi.trim()) return;
    setKodi({
      ...kodi,
      pathMappings: [
        ...(kodi.pathMappings ?? []),
        { localPrefix: newMapLocal.trim(), kodiPrefix: newMapKodi.trim() },
      ],
    });
    setNewMapLocal('');
    setNewMapKodi('');
  };

  const handleGeneratePlaylist = async () => {
    const res = await api.generateSmartPlaylist({
      name: playlistName,
      type: 'movies',
      genre: playlistGenre || undefined,
      minRating: playlistMinRating ? Number(playlistMinRating) : undefined,
      resolution: playlist4k ? '2160p' : undefined,
      orderBy: 'rating',
    });
    setGeneratedXml(res.xml);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-sky-400" /> Media Sources, Preferences & Kodi Integration
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure movie/TV folders, NFO & artwork naming rules, Kodi JSON-RPC library control, and Smart Playlist export.
          </p>
        </div>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await api.resetSampleLibrary();
              await load();
              onRefresh();
              notify('Sample Kodi library reset & re-indexed');
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Reset Demo Sample Library
        </button>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4" /> {msg}
        </div>
      )}

      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" /> {errorMsg}
          </span>
          <button onClick={() => setErrorMsg(null)} className="text-rose-300 hover:text-white cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Media Sources */}
      <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-white">
          <HardDrive className="w-5 h-5 text-sky-400" /> Media Sources (Library Folders)
        </div>

        <div className="space-y-2">
          {sources.map((s) => {
            const activeJob = scanJobs.find(
              (j) => j.sourceId === s.id && (j.status === 'running' || j.status === 'queued')
            );
            const isBusyThis = Boolean(activeJob);
            const isQueuedThis = activeJob?.status === 'queued';
            return (
              <div key={s.id} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-bold uppercase text-[10px]">{s.mediaKind}</span>
                    <span className="font-bold text-slate-100">{s.name}</span>
                    {activeJob && (
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-semibold ${
                          isQueuedThis
                            ? 'bg-slate-800 border-slate-700 text-slate-300'
                            : 'bg-amber-500/15 border-amber-500/30 text-amber-300'
                        }`}
                      >
                        {isQueuedThis ? (
                          <Clock className="w-3 h-3 text-slate-400" />
                        ) : (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        )}
                        {isQueuedThis ? 'Queued' : `Scanning (${activeJob.overallPercent}%)`}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-slate-400 mt-0.5">{s.path}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={isBusyThis}
                    onClick={() => handleScanSingleSource(s)}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${activeJob?.status === 'running' ? 'animate-spin' : ''}`} />
                    {isQueuedThis ? 'Queued' : isBusyThis ? 'Scanning...' : 'Scan'}
                  </button>
                  <button
                    disabled={isBusyThis}
                    onClick={async () => {
                      await api.deleteSource(s.id);
                      setDismissedJobIds((prev) => {
                        const next = new Set(prev);
                        for (const j of scanJobs) {
                          if (j.sourceId === s.id) next.add(j.jobId);
                        }
                        return next;
                      });
                      await loadSourcesOnly();
                      onRefresh();
                    }}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 disabled:opacity-40 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Source Setup & Scan Progress Steps (all active, queued, and undismissed jobs) */}
        {[...scanJobs]
          .filter((j) => j.status === 'running' || j.status === 'queued' || !dismissedJobIds.has(j.jobId))
          .sort((a, b) => {
            const rank = (s: SourceScanJob['status']) =>
              s === 'running' ? 0 : s === 'queued' ? 1 : 2;
            return rank(a.status) - rank(b.status);
          })
          .map((scanJob) => {
            const isJobActive = scanJob.status === 'running' || scanJob.status === 'queued';
            return (
              <div key={scanJob.jobId} className="p-4 rounded-xl bg-slate-950/80 border border-slate-800 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {scanJob.status === 'running' ? (
                        <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                      ) : scanJob.status === 'queued' ? (
                        <Clock className="w-4 h-4 text-slate-400 shrink-0" />
                      ) : scanJob.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                      )}
                      <span className="text-xs font-bold text-slate-100">
                        {scanJob.status === 'running'
                          ? `Indexing Source: ${scanJob.sourceName}`
                          : scanJob.status === 'queued'
                            ? `Queued Source: ${scanJob.sourceName}`
                            : scanJob.status === 'completed'
                              ? `Completed Source Scan: ${scanJob.sourceName}`
                              : `Failed Source Scan: ${scanJob.sourceName}`}
                      </span>
                      <span className="text-[11px] font-mono text-sky-300 font-semibold">{scanJob.overallPercent}%</span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                      {scanJob.currentItem ? `Current: ${scanJob.currentItem}` : scanJob.sourcePath}
                    </div>
                  </div>
                  {!isJobActive && (
                    <button
                      onClick={() =>
                        setDismissedJobIds((prev) => {
                          const next = new Set(prev);
                          next.add(scanJob.jobId);
                          return next;
                        })
                      }
                      aria-label="Dismiss scan summary"
                      className="p-1 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Overall Progress Bar */}
                <div className="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full transition-all duration-200 ${
                      scanJob.status === 'failed'
                        ? 'bg-rose-500'
                        : scanJob.status === 'completed'
                          ? 'bg-emerald-500'
                          : scanJob.status === 'queued'
                            ? 'bg-slate-500'
                            : 'bg-sky-500'
                    }`}
                    style={{ width: `${scanJob.overallPercent}%` }}
                  />
                </div>

                {/* Step Checklist */}
                <div className="space-y-2">
                  {scanJob.steps.map((step, idx) => {
                    const hasCounts =
                      typeof step.totalCount === 'number' && typeof step.completedCount === 'number' && step.totalCount > 0;
                    const stepPct = hasCounts ? Math.round((step.completedCount! / step.totalCount!) * 100) : null;
                    return (
                      <div
                        key={step.id}
                        className={`p-2.5 rounded-lg border text-xs transition ${
                          step.status === 'in_progress'
                            ? 'bg-sky-500/10 border-sky-500/40'
                            : step.status === 'completed'
                              ? 'bg-emerald-500/5 border-emerald-500/25'
                              : step.status === 'error'
                                ? 'bg-rose-500/10 border-rose-500/40'
                                : 'bg-slate-900/50 border-slate-800/80 opacity-70'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {step.status === 'completed' ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                            ) : step.status === 'in_progress' ? (
                              <Loader2 className="w-4 h-4 text-sky-400 animate-spin shrink-0" />
                            ) : step.status === 'error' ? (
                              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
                            ) : (
                              <Circle className="w-4 h-4 text-slate-600 shrink-0" />
                            )}
                            <span className="font-semibold text-slate-100">
                              {idx + 1}. {step.label}
                            </span>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {hasCounts && (
                              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-700 text-[10px] font-mono text-slate-300">
                                {step.completedCount}/{step.totalCount}
                                {stepPct !== null ? ` (${stepPct}%)` : ''}
                              </span>
                            )}
                            <span
                              className={`text-[10px] font-bold uppercase ${
                                step.status === 'completed'
                                  ? 'text-emerald-400'
                                  : step.status === 'in_progress'
                                    ? 'text-sky-300'
                                    : step.status === 'error'
                                      ? 'text-rose-400'
                                      : 'text-slate-500'
                              }`}
                            >
                              {step.status === 'in_progress' ? 'In Progress' : step.status}
                            </span>
                          </div>
                        </div>
                        <div className="mt-1 pl-6 flex items-center justify-between gap-3 text-[11px] text-slate-400">
                          <span>{step.description}</span>
                          {step.detail && <span className="font-mono text-slate-300 truncate max-w-[260px]">{step.detail}</span>}
                        </div>
                        {step.status === 'in_progress' && stepPct !== null && (
                          <div className="mt-2 pl-6">
                            <div className="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                              <div
                                className="h-full bg-sky-400 transition-all duration-150"
                                style={{ width: `${stepPct}%` }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}

        <form onSubmit={handleAddSource} className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-2 border-t border-slate-800 text-xs">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Source label (e.g. NAS 4K Movies)"
            className="md:col-span-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
          />
          <div className="md:col-span-5 flex gap-1.5">
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/path/to/media/folder"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100"
            />
            <button
              type="button"
              onClick={() => setBrowseOpen(true)}
              className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-sky-400" /> Browse
            </button>
          </div>
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as 'movie' | 'tvshow')}
            className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100"
          >
            <option value="movie">Movies</option>
            <option value="tvshow">TV Shows</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="md:col-span-2 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold flex items-center justify-center gap-1 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" /> Add Source
          </button>
        </form>
      </div>

      {/* Preferences & Kodi RPC */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {prefs && (
          <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Kodi NFO & Artwork Preferences</h3>
              <button
                onClick={handleSavePrefs}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Movie NFO Naming</label>
                <select
                  value={prefs.defaultNfoNaming}
                  onChange={(e) => setPrefs({ ...prefs, defaultNfoNaming: e.target.value as AppPreferences['defaultNfoNaming'] })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-200"
                >
                  <option value="movie.nfo">movie.nfo (dedicated folder)</option>
                  <option value="filename.nfo">&lt;videofilename&gt;.nfo</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Artwork Naming</label>
                <select
                  value={prefs.defaultArtworkNaming}
                  onChange={(e) => setPrefs({ ...prefs, defaultArtworkNaming: e.target.value as AppPreferences['defaultArtworkNaming'] })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-200"
                >
                  <option value="folder">poster.jpg / fanart.jpg</option>
                  <option value="filename">&lt;videoname&gt;-poster.jpg</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1.5">Artwork Types to Scrape & Download</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ARTWORK_KINDS.map((k) => {
                  const active = prefs.downloadArtworkKinds.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setPrefs({
                          ...prefs,
                          downloadArtworkKinds: active
                            ? prefs.downloadArtworkKinds.filter((x) => x !== k)
                            : [...prefs.downloadArtworkKinds, k],
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg border font-semibold capitalize cursor-pointer ${
                        active ? 'bg-sky-500/20 border-sky-500/40 text-sky-300' : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                Preferred Subtitle Languages (comma separated ISO codes)
              </label>
              <input
                value={prefs.preferredSubtitleLanguages.join(', ')}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    preferredSubtitleLanguages: e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
                  })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
              />
            </div>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.autoWriteNfoOnScrape}
                onChange={(e) => setPrefs({ ...prefs, autoWriteNfoOnScrape: e.target.checked })}
              />
              Automatically write NFO XML immediately after scraping
            </label>
          </div>
        )}

        {kodi && (
          <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-sky-400" /> Kodi JSON-RPC Bridge
              </h3>
              <button
                onClick={handleSaveKodi}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Kodi Host / IP</label>
                <input
                  value={kodi.host}
                  onChange={(e) => setKodi({ ...kodi, host: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Port</label>
                <input
                  type="number"
                  value={kodi.port}
                  onChange={(e) => setKodi({ ...kodi, port: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Username</label>
                <input
                  value={kodi.username}
                  onChange={(e) => setKodi({ ...kodi, username: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Password</label>
                <input
                  type="password"
                  value={kodi.password}
                  onChange={(e) => setKodi({ ...kodi, password: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
            </div>

            {kodi.lastStatus && (
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                Status: <span className="text-sky-300">{kodi.lastStatus}</span>
              </div>
            )}

            {/* Path Mappings (Local Host <-> Kodi Network / Container Path) */}
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                  Path Mappings (Local Path → Kodi Path)
                </span>
                <span className="text-[10px] text-slate-500">Used for RPC sync &amp; sources.xml export</span>
              </div>
              {(kodi.pathMappings ?? []).length > 0 && (
                <div className="space-y-1">
                  {kodi.pathMappings.map((pm, idx) => (
                    <div
                      key={`${pm.localPrefix}-${idx}`}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-[11px]"
                    >
                      <span className="truncate text-slate-300">{pm.localPrefix}</span>
                      <span className="text-sky-400 shrink-0">→</span>
                      <span className="truncate text-emerald-300 flex-1">{pm.kodiPrefix}</span>
                      <button
                        type="button"
                        onClick={() =>
                          setKodi({
                            ...kodi,
                            pathMappings: kodi.pathMappings.filter((_, i) => i !== idx),
                          })
                        }
                        aria-label="Remove path mapping"
                        className="p-1 rounded text-rose-400 hover:bg-rose-500/15 cursor-pointer shrink-0"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                <input
                  value={newMapLocal}
                  onChange={(e) => setNewMapLocal(e.target.value)}
                  placeholder="/mnt/media/Movies"
                  className="flex-1 min-w-[130px] bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-100"
                />
                <input
                  value={newMapKodi}
                  onChange={(e) => setNewMapKodi(e.target.value)}
                  placeholder="smb://nas/Movies"
                  className="flex-1 min-w-[130px] bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 font-mono text-[11px] text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleAddPathMapping}
                  disabled={!newMapLocal.trim() || !newMapKodi.trim()}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-sky-300 font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" /> Map
                </button>
              </div>
            </div>

            {kodiSyncResult && (
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2">
                <span>
                  Last {kodiSyncResult.direction === 'pull' ? 'Pull' : 'Push'}: Matched{' '}
                  <strong className="text-slate-100">{kodiSyncResult.matchedMovies}</strong> movies (
                  <strong className="text-emerald-300">{kodiSyncResult.updatedMovies} updated</strong>) ·{' '}
                  <strong className="text-slate-100">{kodiSyncResult.matchedEpisodes}</strong> episodes (
                  <strong className="text-emerald-300">{kodiSyncResult.updatedEpisodes} updated</strong>)
                </span>
                {kodiSyncResult.unmatchedCount > 0 && (
                  <span className="text-slate-400">{kodiSyncResult.unmatchedCount} unmatched</span>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleTestKodi}
                className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-semibold cursor-pointer"
              >
                Test Connection
              </button>
              <button
                onClick={() => handleKodiSync('pull')}
                disabled={Boolean(kodiSyncBusy)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowDownToLine className="w-3.5 h-3.5" />
                {kodiSyncBusy === 'pull' ? 'Pulling...' : 'Pull Watched & Ratings'}
              </button>
              <button
                onClick={() => handleKodiSync('push')}
                disabled={Boolean(kodiSyncBusy)}
                className="px-3 py-1.5 rounded-lg bg-purple-500/15 hover:bg-purple-500/25 border border-purple-500/35 text-purple-300 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <ArrowUpFromLine className="w-3.5 h-3.5" />
                {kodiSyncBusy === 'push' ? 'Pushing...' : 'Push Watched & Ratings'}
              </button>
              <button
                onClick={async () => {
                  const r = await api.triggerKodiScan();
                  notify(r.ok ? 'Triggered Kodi VideoLibrary.Scan' : `Kodi RPC: ${r.error}`);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
              >
                Trigger Library Scan
              </button>
              <button
                onClick={async () => {
                  const r = await api.triggerKodiClean();
                  notify(r.ok ? 'Triggered Kodi VideoLibrary.Clean' : `Kodi RPC: ${r.error}`);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
              >
                Clean Kodi Library
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Subtitle Provider Configuration */}
      <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Subtitles className="w-4 h-4 text-sky-400" /> Subtitle Providers (OpenSubtitles & SubDL)
            </h3>
            <p className="text-slate-400 mt-0.5">
              Configure API credentials for online hash-matched subtitle downloads, or keep Offline / Local Sync Fallback enabled.
            </p>
          </div>
          <button
            onClick={async () => {
              await api.saveSubtitleConfig(subCfg);
              notify('Subtitle provider settings saved');
            }}
            className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> Save Subtitle Providers
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-[10px] font-semibold uppercase text-slate-400 flex items-center gap-1 mb-1">
              <KeyRound className="w-3 h-3" /> OpenSubtitles.com API Key
            </label>
            <input
              type="password"
              value={subCfg.openSubtitlesApiKey}
              onChange={(e) => setSubCfg({ ...subCfg, openSubtitlesApiKey: e.target.value })}
              placeholder="Optional (uses local sync engine if blank)"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100"
            />
          </div>
          <div>
            <label className="text-[10px] font-semibold uppercase text-slate-400 flex items-center gap-1 mb-1">
              <KeyRound className="w-3 h-3" /> SubDL API Key
            </label>
            <input
              type="password"
              value={subCfg.subdlApiKey}
              onChange={(e) => setSubCfg({ ...subCfg, subdlApiKey: e.target.value })}
              placeholder="Optional"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100"
            />
          </div>
          <label className="flex items-center gap-2 text-slate-300 pb-2 cursor-pointer">
            <input
              type="checkbox"
              checked={subCfg.useDemoFallback}
              onChange={(e) => setSubCfg({ ...subCfg, useDemoFallback: e.target.checked })}
              className="rounded border-slate-700 bg-slate-900"
            />
            Offline / Local Sync Fallback
          </label>
        </div>
      </div>

      {/* Exports & Smart Playlist */}
      <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-amber-400" /> Export & Kodi Smart Playlist (.xsp) Generator
          </h3>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/export/json"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export JSON
            </a>
            <a
              href="/api/export/csv"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </a>
            <button
              onClick={async () => {
                const res = await api.getSourcesXml();
                setGeneratedXml(res.xml);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
            >
              Preview sources.xml
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 items-end">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Playlist Name</label>
            <input
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Genre Filter</label>
            <input
              value={playlistGenre}
              onChange={(e) => setPlaylistGenre(e.target.value)}
              placeholder="e.g. Science Fiction"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Min Rating</label>
            <input
              value={playlistMinRating}
              onChange={(e) => setPlaylistMinRating(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100"
            />
          </div>
          <button
            onClick={handleGeneratePlaylist}
            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold cursor-pointer"
          >
            Generate .xsp XML
          </button>
        </div>

        <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
          <input type="checkbox" checked={playlist4k} onChange={(e) => setPlaylist4k(e.target.checked)} />
          4K UHD (&gt;1080p) Only
        </label>

        {generatedXml && (
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-200 overflow-x-auto">
            {generatedXml}
          </pre>
        )}
      </div>

      <FolderBrowserModal
        open={browseOpen}
        onSelect={(p) => setNewPath(p)}
        onClose={() => setBrowseOpen(false)}
      />
    </div>
  );
};
