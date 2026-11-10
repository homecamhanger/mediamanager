import React, { useEffect, useState } from 'react';
import { Check, Clock, Download, FileText, Hash, Languages, Search, Sparkles, X } from 'lucide-react';
import type { SubtitleCue, SubtitleFileRecord, SubtitleSearchResult } from '../../shared/types.js';
import { api } from '../lib/api.js';
import { useEscapeKey } from '../lib/useEscapeKey.js';

const LANG_OPTIONS = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Spanish' },
  { code: 'fr', label: 'French' },
  { code: 'de', label: 'German' },
  { code: 'ja', label: 'Japanese' },
  { code: 'ko', label: 'Korean' },
  { code: 'zh', label: 'Chinese' },
  { code: 'pt', label: 'Portuguese' },
  { code: 'it', label: 'Italian' },
];

export const SubtitleSearchModal: React.FC<{
  open: boolean;
  mediaType: 'movie' | 'episode';
  mediaId: number;
  mediaTitle: string;
  onDownloaded: () => void;
  onClose: () => void;
}> = ({ open, mediaType, mediaId, mediaTitle, onDownloaded, onClose }) => {
  const [query, setQuery] = useState(mediaTitle);
  const [selectedLangs, setSelectedLangs] = useState<string[]>(['en']);
  const [forcedOnly, setForcedOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [results, setResults] = useState<SubtitleSearchResult[]>([]);
  const [downloadedIds, setDownloadedIds] = useState<Set<string>>(new Set());

  const runSearch = async () => {
    setLoading(true);
    try {
      const res = await api.searchSubtitles({
        mediaType,
        mediaId,
        languages: selectedLangs,
        query,
        forcedOnly,
      });
      setResults(res.results);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setQuery(mediaTitle);
      setDownloadedIds(new Set());
      void runSearch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, mediaId, mediaType]);

  useEscapeKey(open, onClose);

  if (!open) return null;

  const toggleLang = (code: string) => {
    setSelectedLangs((prev) =>
      prev.includes(code) ? (prev.length > 1 ? prev.filter((c) => c !== code) : prev) : [...prev, code]
    );
  };

  const handleDownload = async (cand: SubtitleSearchResult) => {
    setDownloadingId(cand.id);
    try {
      await api.downloadSubtitle(mediaType, mediaId, cand);
      setDownloadedIds((prev) => new Set([...prev, cand.id]));
      onDownloaded();
    } finally {
      setDownloadingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="relative pl-5 pr-14 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Languages className="w-4 h-4 text-sky-400" />
              Search & Download Subtitles
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{mediaTitle}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            title="Close (Esc)"
            className="absolute top-3.5 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 border-b border-slate-800/80 bg-slate-900/40">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && runSearch()}
                placeholder="Search title or release name..."
                className="w-full bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-2 text-sm text-slate-100"
              />
            </div>
            <button
              onClick={runSearch}
              disabled={loading}
              className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-sm font-semibold cursor-pointer disabled:opacity-50"
            >
              {loading ? 'Searching...' : 'Search'}
            </button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {LANG_OPTIONS.map((l) => {
                const active = selectedLangs.includes(l.code);
                return (
                  <button
                    key={l.code}
                    onClick={() => toggleLang(l.code)}
                    className={`px-2.5 py-1 rounded-md text-xs font-medium border cursor-pointer transition ${
                      active
                        ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {l.label} ({l.code})
                  </button>
                );
              })}
            </div>
            <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={forcedOnly}
                onChange={(e) => setForcedOnly(e.target.checked)}
                className="rounded border-slate-700 bg-slate-900"
              />
              Forced Only
            </label>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2.5">
          {results.length === 0 ? (
            <div className="text-center py-12 text-sm text-slate-500">
              {loading ? 'Querying subtitle providers...' : 'No subtitle matches found. Try adjusting languages or search text.'}
            </div>
          ) : (
            results.map((r) => {
              const isDone = downloadedIds.has(r.id);
              return (
                <div
                  key={r.id}
                  className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 flex items-center justify-between gap-4"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 text-[11px] font-bold uppercase">
                        {r.languageName}
                      </span>
                      <span className="text-xs font-semibold text-slate-400 uppercase">{r.provider}</span>
                      {r.hashMatch && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 text-[10px] font-bold">
                          <Hash className="w-3 h-3" /> Hash Match
                        </span>
                      )}
                      {r.forced && (
                        <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-bold">FORCED</span>
                      )}
                      {r.sdh && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-500/15 text-purple-300 text-[10px] font-bold">SDH / HI</span>
                      )}
                      <span className="text-[10px] text-slate-500">
                        {r.dataOrigin === 'live-api' ? 'Live API' : 'Synced Local Engine'}
                      </span>
                    </div>
                    <div className="text-sm font-medium text-slate-100 truncate mt-1 font-mono">{r.releaseName}</div>
                    <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-3">
                      <span>Format: {r.format.toUpperCase()}</span>
                      {r.fps && <span>FPS: {r.fps}</span>}
                      <span>Downloads: {r.downloads.toLocaleString()}</span>
                      <span>Score: ★ {r.rating.toFixed(1)}</span>
                      <span>Uploader: {r.uploader}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDownload(r)}
                    disabled={downloadingId === r.id}
                    className={`shrink-0 px-3.5 py-2 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                      isDone
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-sky-500 hover:bg-sky-400 text-white'
                    }`}
                  >
                    {isDone ? <Check className="w-3.5 h-3.5" /> : <Download className="w-3.5 h-3.5" />}
                    {downloadingId === r.id ? 'Saving...' : isDone ? 'Saved to Folder' : 'Download'}
                  </button>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

export const SubtitleEditorModal: React.FC<{
  subtitleId: number | null;
  onUpdated: () => void;
  onClose: () => void;
}> = ({ subtitleId, onUpdated, onClose }) => {
  const [sub, setSub] = useState<SubtitleFileRecord | null>(null);
  const [cues, setCues] = useState<SubtitleCue[]>([]);
  const [raw, setRaw] = useState('');
  const [shiftMs, setShiftMs] = useState(500);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!subtitleId) return;
    const data = await api.previewSubtitle(subtitleId);
    setSub(data.subtitle);
    setCues(data.cues);
    setRaw(data.raw);
  };

  useEffect(() => {
    if (subtitleId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtitleId]);

  useEscapeKey(Boolean(subtitleId), onClose);

  if (!subtitleId) return null;

  const applyTransform = async (action: Parameters<typeof api.transformSubtitle>[1]) => {
    if (!sub) return;
    setBusy(true);
    try {
      const res = await api.transformSubtitle(sub.id, action);
      setSub(res.subtitle);
      await load();
      onUpdated();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        <div className="relative pl-5 pr-14 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <FileText className="w-4 h-4 text-sky-400" />
              Subtitle Sync & Flag Editor
            </h3>
            <p className="text-xs text-slate-400 font-mono mt-0.5">{sub?.fileName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close modal"
            title="Close (Esc)"
            className="absolute top-3.5 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="number"
              value={shiftMs}
              onChange={(e) => setShiftMs(Number(e.target.value))}
              className="w-24 bg-slate-950 border border-slate-700 rounded-lg px-2 py-1 text-xs text-slate-100"
            />
            <span className="text-xs text-slate-400">ms</span>
            <button
              disabled={busy}
              onClick={() => applyTransform({ shiftMs: Math.abs(shiftMs) })}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
            >
              +{Math.abs(shiftMs)}ms
            </button>
            <button
              disabled={busy}
              onClick={() => applyTransform({ shiftMs: -Math.abs(shiftMs) })}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
            >
              -{Math.abs(shiftMs)}ms
            </button>
          </div>

          <button
            disabled={busy}
            onClick={() => applyTransform({ fromFps: 23.976, toFps: 25.0 })}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
          >
            23.976 → 25 FPS
          </button>

          <button
            disabled={busy}
            onClick={() => applyTransform({ stripHi: true, sdh: false })}
            className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1 cursor-pointer"
          >
            <Sparkles className="w-3 h-3 text-amber-400" /> Strip HI/SDH Tags
          </button>

          {sub && (
            <>
              <button
                disabled={busy}
                onClick={() => applyTransform({ forced: !sub.forced })}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                  sub.forced ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                Forced: {sub.forced ? 'ON' : 'OFF'}
              </button>
              <button
                disabled={busy}
                onClick={() => applyTransform({ sdh: !sub.sdh })}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold border cursor-pointer ${
                  sub.sdh ? 'bg-purple-500/20 border-purple-500/40 text-purple-300' : 'bg-slate-900 border-slate-700 text-slate-400'
                }`}
              >
                SDH: {sub.sdh ? 'ON' : 'OFF'}
              </button>
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Parsed Cues ({cues.length})</div>
            <div className="space-y-2">
              {cues.map((c) => (
                <div key={c.index} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-xs">
                  <div className="text-[11px] font-mono text-sky-400 mb-1">
                    #{c.index} • {(c.startMs / 1000).toFixed(2)}s → {(c.endMs / 1000).toFixed(2)}s
                  </div>
                  <div className="text-slate-200 whitespace-pre-line">{c.text}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Raw UTF-8 SRT File</div>
            <pre className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto whitespace-pre-wrap">
              {raw}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
};
