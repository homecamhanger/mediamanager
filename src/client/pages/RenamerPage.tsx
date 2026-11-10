import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, FolderSync, Play, RotateCcw, Save } from 'lucide-react';
import type { RenameHistoryBatch, RenamePatternsConfig, RenamePreviewItem } from '../../shared/types.js';
import { api } from '../lib/api.js';

const MOVIE_TOKENS = [
  '{title}',
  '{year}',
  '{imdb_id}',
  '{tmdb_id}',
  '{collection}',
  '{edition}',
  '{resolution}',
  '{video_codec}',
  '{audio_codec}',
  '{hdr}',
];

const EPISODE_TOKENS = [
  '{show_title}',
  '{year}',
  '{season:02d}',
  '{episode:02d}',
  '{episode_title}',
  '{tvdb_id}',
  '{resolution}',
  '{video_codec}',
];

export const RenamerPage: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const [patterns, setPatterns] = useState<RenamePatternsConfig | null>(null);
  const [previews, setPreviews] = useState<RenamePreviewItem[]>([]);
  const [history, setHistory] = useState<RenameHistoryBatch[]>([]);
  const [selectedIndexes, setSelectedIndexes] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const loadAll = async () => {
    const [pat, hist] = await Promise.all([api.getRenamePatterns(), api.listRenameHistory()]);
    setPatterns(pat);
    setHistory(hist.batches);
    await runPreview(pat);
  };

  const runPreview = async (pat?: RenamePatternsConfig) => {
    setLoading(true);
    try {
      const res = await api.previewRename({ patterns: pat ?? patterns ?? undefined });
      setPreviews(res.items);
      const actionable = new Set<number>();
      res.items.forEach((item, idx) => {
        if (item.hasChanges && !item.conflict) actionable.add(idx);
      });
      setSelectedIndexes(actionable);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!patterns) return <div className="p-8 text-sm text-slate-400">Loading renamer workbench...</div>;

  const handleSavePatterns = async () => {
    await api.saveRenamePatterns(patterns);
    await runPreview(patterns);
    setStatusMsg('Rename patterns saved & preview refreshed');
  };

  const handleExecute = async () => {
    const chosen = previews.filter((_, idx) => selectedIndexes.has(idx));
    if (chosen.length === 0) return;
    setLoading(true);
    try {
      const res = await api.executeRename(chosen, patterns.cleanupEmptyFolders);
      setStatusMsg(`Renamed ${res.movedCount} items (${res.errors.length} errors)`);
      await loadAll();
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const handleUndo = async (batchId: string) => {
    setLoading(true);
    try {
      const res = await api.undoRenameBatch(batchId);
      setStatusMsg(`Reverted ${res.revertedFiles} files cleanly`);
      await loadAll();
      onRefresh();
    } finally {
      setLoading(false);
    }
  };

  const pendingCount = previews.filter((p) => p.hasChanges && !p.conflict).length;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <FolderSync className="w-6 h-6 text-amber-400" /> Automatic File & Folder Renamer
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Kodi-compliant folder & filename templates with automatic NFO, artwork & subtitle synchronization and full undo rollback.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => runPreview(patterns)}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
          >
            Refresh Dry-Run Preview
          </button>
          <button
            onClick={handleExecute}
            disabled={loading || selectedIndexes.size === 0}
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <Play className="w-3.5 h-3.5" /> Execute Rename ({selectedIndexes.size})
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4" /> {statusMsg}
        </div>
      )}

      {/* Pattern Designer */}
      <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white">Naming Templates & Rules</h3>
          <button
            onClick={handleSavePatterns}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-300 flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-3.5 h-3.5" /> Save Defaults
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Movie Folder Pattern</label>
            <input
              value={patterns.movieFolderPattern}
              onChange={(e) => setPatterns({ ...patterns, movieFolderPattern: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Movie File Pattern</label>
            <input
              value={patterns.movieFilePattern}
              onChange={(e) => setPatterns({ ...patterns, movieFilePattern: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">TV Show Folder Pattern</label>
            <input
              value={patterns.tvShowFolderPattern}
              onChange={(e) => setPatterns({ ...patterns, tvShowFolderPattern: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100"
            />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Season Folder</label>
              <input
                value={patterns.seasonFolderPattern}
                onChange={(e) => setPatterns({ ...patterns, seasonFolderPattern: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100"
              />
            </div>
            <div className="col-span-2">
              <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Episode File Pattern</label>
              <input
                value={patterns.episodeFilePattern}
                onChange={(e) => setPatterns({ ...patterns, episodeFilePattern: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Colons:</span>
            <select
              value={patterns.colonReplacement}
              onChange={(e) => setPatterns({ ...patterns, colonReplacement: e.target.value as RenamePatternsConfig['colonReplacement'] })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1"
            >
              <option value="dash">Replace with " - "</option>
              <option value="space">Replace with space</option>
              <option value="remove">Remove</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Spaces:</span>
            <select
              value={patterns.spaceReplacement}
              onChange={(e) => setPatterns({ ...patterns, spaceReplacement: e.target.value as RenamePatternsConfig['spaceReplacement'] })}
              className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-1"
            >
              <option value="space">Keep Spaces</option>
              <option value="dot">Dots (.)</option>
              <option value="underscore">Underscores (_)</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={patterns.renameSidecarFiles}
              onChange={(e) => setPatterns({ ...patterns, renameSidecarFiles: e.target.checked })}
            />
            Sync Sidecars (NFO, Subs, Art)
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input
              type="checkbox"
              checked={patterns.cleanupEmptyFolders}
              onChange={(e) => setPatterns({ ...patterns, cleanupEmptyFolders: e.target.checked })}
            />
            Clean Empty Folders
          </label>
        </div>

        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span className="text-slate-500 mr-1 py-1">Tokens:</span>
          {[...new Set([...MOVIE_TOKENS, ...EPISODE_TOKENS])].map((tok) => (
            <code key={tok} className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-sky-300">
              {tok}
            </code>
          ))}
        </div>
      </div>

      {/* Dry Run Table */}
      <div className="rounded-2xl bg-[#111827] border border-slate-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
          <span className="text-xs font-bold text-slate-200">
            Dry-Run Preview ({pendingCount} items need renaming out of {previews.length})
          </span>
        </div>
        <div className="divide-y divide-slate-800/70 max-h-[420px] overflow-y-auto">
          {previews.map((item, idx) => {
            const checked = selectedIndexes.has(idx);
            return (
              <div
                key={`${item.mediaType}-${item.mediaId}`}
                className={`p-3.5 text-xs flex items-start gap-3 ${!item.hasChanges ? 'opacity-50' : ''}`}
              >
                <input
                  type="checkbox"
                  disabled={!item.hasChanges || Boolean(item.conflict)}
                  checked={checked}
                  onChange={() => {
                    setSelectedIndexes((prev) => {
                      const next = new Set(prev);
                      if (next.has(idx)) next.delete(idx);
                      else next.add(idx);
                      return next;
                    });
                  }}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase text-[10px] font-bold">
                      {item.mediaType}
                    </span>
                    <span className="font-bold text-slate-100">{item.title}</span>
                    {!item.hasChanges && <span className="text-[10px] text-emerald-400 font-semibold">Already Compliant</span>}
                    {item.conflict && (
                      <span className="inline-flex items-center gap-1 text-[10px] text-rose-400 font-semibold">
                        <AlertTriangle className="w-3 h-3" /> {item.conflict}
                      </span>
                    )}
                  </div>
                  <div className="font-mono text-[11px] space-y-0.5">
                    <div className="text-slate-500 truncate">- {item.oldPath}</div>
                    <div className={item.hasChanges ? 'text-emerald-300 truncate' : 'text-slate-400 truncate'}>
                      + {item.newPath}
                    </div>
                  </div>
                  {item.sidecars.length > 0 && (
                    <div className="text-[10px] text-sky-400">
                      + {item.sidecars.length} sidecar file(s) synced ({item.sidecars.map((s) => s.kind).join(', ')})
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Rename History + Undo */}
      <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-3">
        <h3 className="text-sm font-bold text-white">Rename History & Rollback</h3>
        {history.length === 0 ? (
          <div className="text-xs text-slate-500">No rename batches executed yet.</div>
        ) : (
          <div className="space-y-2">
            {history.map((b) => (
              <div key={b.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between text-xs">
                <div>
                  <span className="font-semibold text-slate-100">{b.itemCount} items</span>
                  <span className="text-slate-400 mx-2">•</span>
                  <span className="text-slate-400">{b.moves.length} files moved</span>
                  <span className="text-slate-500 ml-2">{new Date(b.createdAt).toLocaleString()}</span>
                </div>
                {b.reverted ? (
                  <span className="text-[11px] text-slate-500 font-semibold">Reverted</span>
                ) : (
                  <button
                    onClick={() => handleUndo(b.id)}
                    className="px-3 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 border border-amber-500/30 text-amber-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" /> Undo Batch
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
