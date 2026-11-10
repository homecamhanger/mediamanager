import React, { useEffect, useState } from 'react';
import { Download, KeyRound, Languages, Save, Search, Subtitles, Trash2 } from 'lucide-react';
import type { MovieRecord, SubtitleFileRecord } from '../../shared/types.js';
import { SubtitleEditorModal, SubtitleSearchModal } from '../components/SubtitleSearchModal.js';
import { api, formatBytes } from '../lib/api.js';

export const SubtitlesPage: React.FC<{
  movies: MovieRecord[];
  onRefresh: () => void;
}> = ({ movies, onRefresh }) => {
  const [subs, setSubs] = useState<Array<SubtitleFileRecord & { mediaTitle: string }>>([]);
  const [filter, setFilter] = useState('');
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [searchMovie, setSearchMovie] = useState<MovieRecord | null>(null);
  const [batchLangs, setBatchLangs] = useState('en');
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchStatus, setBatchStatus] = useState<string | null>(null);
  const [cfg, setCfg] = useState({
    openSubtitlesApiKey: '',
    openSubtitlesUsername: '',
    openSubtitlesPassword: '',
    subdlApiKey: '',
    useDemoFallback: true,
  });

  const load = async () => {
    const [sRes, cRes] = await Promise.all([api.listSubtitles(), api.getSubtitleConfig()]);
    setSubs(sRes.subtitles);
    setCfg(cRes);
  };

  useEffect(() => {
    void load();
  }, [movies]);

  const moviesMissingSubs = movies.filter((m) => m.subtitles.length === 0);

  const handleBatchMissing = async () => {
    setBatchBusy(true);
    setBatchStatus(null);
    try {
      const langs = batchLangs.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
      const res = await api.batchMissingSubtitles({ languages: langs.length ? langs : ['en'] });
      await load();
      onRefresh();
      setBatchStatus(`Downloaded ${res.downloaded} missing subtitle files`);
    } finally {
      setBatchBusy(false);
    }
  };

  const filtered = subs.filter((s) =>
    `${s.mediaTitle} ${s.fileName} ${s.language}`.toLowerCase().includes(filter.toLowerCase().trim())
  );

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Subtitles className="w-6 h-6 text-sky-400" /> Subtitle Studio ({subs.length} files)
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Download Kodi-named sidecar subtitles (OpenSubtitles hash match / SubDL), edit timestamps, rescale FPS, and manage Forced/SDH flags.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <input
            value={batchLangs}
            onChange={(e) => setBatchLangs(e.target.value)}
            placeholder="en,es"
            className="w-24 bg-[#111827] border border-slate-800 rounded-xl px-3 py-2 text-xs text-slate-200"
            title="Comma-separated ISO 639-1 language codes"
          />
          <button
            onClick={handleBatchMissing}
            disabled={batchBusy}
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            {batchBusy ? 'Downloading...' : 'Download All Missing Subtitles'}
          </button>
        </div>
      </div>

      {batchStatus && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 font-semibold">
          {batchStatus}
        </div>
      )}

      {/* Provider Keys */}
      <div className="p-4 rounded-2xl bg-[#111827] border border-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
        <div>
          <label className="text-[10px] font-semibold uppercase text-slate-400 flex items-center gap-1 mb-1">
            <KeyRound className="w-3 h-3" /> OpenSubtitles.com API Key
          </label>
          <input
            type="password"
            value={cfg.openSubtitlesApiKey}
            onChange={(e) => setCfg({ ...cfg, openSubtitlesApiKey: e.target.value })}
            placeholder="Optional (uses local sync engine if blank)"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          />
        </div>
        <div>
          <label className="text-[10px] font-semibold uppercase text-slate-400 flex items-center gap-1 mb-1">
            <KeyRound className="w-3 h-3" /> SubDL API Key
          </label>
          <input
            type="password"
            value={cfg.subdlApiKey}
            onChange={(e) => setCfg({ ...cfg, subdlApiKey: e.target.value })}
            placeholder="Optional"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-slate-300 pb-2 cursor-pointer">
          <input
            type="checkbox"
            checked={cfg.useDemoFallback}
            onChange={(e) => setCfg({ ...cfg, useDemoFallback: e.target.checked })}
            className="rounded border-slate-700 bg-slate-900"
          />
          Offline / Local Sync Fallback
        </label>
        <button
          onClick={async () => {
            await api.saveSubtitleConfig(cfg);
            setBatchStatus('Subtitle provider settings saved');
          }}
          className="px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-100 flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Save className="w-3.5 h-3.5" /> Save Subtitle Providers
        </button>
      </div>

      {/* Movies missing subs quick bar */}
      {moviesMissingSubs.length > 0 && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
          <div className="text-xs font-bold text-amber-200">
            Movies Missing Subtitles ({moviesMissingSubs.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {moviesMissingSubs.map((m) => (
              <button
                key={m.id}
                onClick={() => setSearchMovie(m)}
                className="px-3 py-1.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-amber-500/30 text-xs text-slate-100 flex items-center gap-1.5 cursor-pointer"
              >
                <Languages className="w-3.5 h-3.5 text-amber-400" />
                {m.title} ({m.year ?? '?'})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Existing Subtitles Table */}
      <div className="space-y-3">
        <div className="relative max-w-sm">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter subtitle files..."
            className="w-full bg-[#111827] border border-slate-800 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100"
          />
        </div>

        <div className="rounded-2xl bg-[#111827] border border-slate-800 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-900/90 text-slate-400 uppercase text-[10px] tracking-wider border-b border-slate-800">
              <tr>
                <th className="p-3">Media</th>
                <th className="p-3">Subtitle File</th>
                <th className="p-3">Lang / Flags</th>
                <th className="p-3">Cues / Size</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/70">
              {filtered.map((s) => (
                <tr key={s.id} className="hover:bg-slate-900/50">
                  <td className="p-3 font-semibold text-slate-100">{s.mediaTitle}</td>
                  <td className="p-3 font-mono text-slate-300">{s.fileName}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-1.5">
                      <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-bold uppercase">{s.language}</span>
                      {s.forced && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">FORCED</span>}
                      {s.sdh && <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">SDH</span>}
                    </div>
                  </td>
                  <td className="p-3 text-slate-400">
                    {s.cueCount ?? 0} cues • {formatBytes(s.sizeBytes)}
                  </td>
                  <td className="p-3 text-right space-x-2">
                    <button
                      onClick={() => setEditSubId(s.id)}
                      className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
                    >
                      Preview & Sync
                    </button>
                    <button
                      onClick={async () => {
                        await api.deleteSubtitle(s.id);
                        await load();
                        onRefresh();
                      }}
                      className="p-1 rounded text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {searchMovie && (
        <SubtitleSearchModal
          open={Boolean(searchMovie)}
          mediaType="movie"
          mediaId={searchMovie.id}
          mediaTitle={`${searchMovie.title}${searchMovie.year ? ` (${searchMovie.year})` : ''}`}
          onDownloaded={() => {
            void load();
            onRefresh();
          }}
          onClose={() => setSearchMovie(null)}
        />
      )}

      <SubtitleEditorModal
        subtitleId={editSubId}
        onUpdated={() => {
          void load();
          onRefresh();
        }}
        onClose={() => setEditSubId(null)}
      />
    </div>
  );
};
