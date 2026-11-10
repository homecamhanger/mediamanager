import React, { useEffect, useState } from 'react';
import { AlertTriangle, Check, CheckCircle2, Code2, FileCode2, RefreshCw } from 'lucide-react';
import type { NfoValidationReport } from '../../shared/types.js';
import { api } from '../lib/api.js';

interface NfoListItem {
  mediaType: 'movie' | 'tvshow' | 'episode';
  mediaId: number;
  title: string;
  nfoPath: string | null;
  hasNfo: boolean;
  nfoValid: boolean;
  warnings: string[];
}

export const NfoInspectorPage: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const [items, setItems] = useState<NfoListItem[]>([]);
  const [filter, setFilter] = useState<'all' | 'missing' | 'warnings' | 'valid'>('all');
  const [selected, setSelected] = useState<NfoListItem | null>(null);
  const [xml, setXml] = useState('');
  const [nfoPath, setNfoPath] = useState('');
  const [existsOnDisk, setExistsOnDisk] = useState(false);
  const [validation, setValidation] = useState<NfoValidationReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const loadList = async () => {
    const res = await api.listNfos();
    setItems(res.items);
    if (!selected && res.items[0]) {
      await openItem(res.items[0]);
    }
  };

  const openItem = async (item: NfoListItem) => {
    setSelected(item);
    const data = await api.readNfo(item.mediaType, item.mediaId);
    setXml(data.xml);
    setNfoPath(data.nfoPath);
    setExistsOnDisk(data.existsOnDisk);
    setValidation(data.validation);
  };

  useEffect(() => {
    void loadList();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = items.filter((i) => {
    if (filter === 'missing') return !i.hasNfo;
    if (filter === 'warnings') return i.hasNfo && (!i.nfoValid || i.warnings.length > 0);
    if (filter === 'valid') return i.hasNfo && i.nfoValid && i.warnings.length === 0;
    return true;
  });

  const handleSave = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await api.saveNfo(selected.mediaType, selected.mediaId, xml);
      setValidation(res.validation);
      setExistsOnDisk(true);
      setMsg(`Saved ${res.nfoPath}`);
      await loadList();
      onRefresh();
    } catch (e) {
      setMsg(`Error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleRegenerateAll = async () => {
    setBusy(true);
    try {
      const res = await api.regenerateNfos({ scope: 'all' });
      setMsg(`Generated/updated ${res.written} Kodi v21 NFO files`);
      await loadList();
      if (selected) await openItem(selected);
      onRefresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-6 space-y-5 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Code2 className="w-6 h-6 text-emerald-400" /> Kodi NFO XML Inspector & Validator
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Inspect, edit, validate, and batch-generate Kodi v21 Omega compliant NFO XML files across movies, shows, and episodes.
          </p>
        </div>
        <button
          onClick={handleRegenerateAll}
          disabled={busy}
          className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} /> Batch Generate / Sync All NFOs
        </button>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300">{msg}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left List */}
        <div className="lg:col-span-5 rounded-2xl bg-[#111827] border border-slate-800 overflow-hidden flex flex-col max-h-[680px]">
          <div className="p-3 border-b border-slate-800 flex flex-wrap gap-1.5 bg-slate-900/60">
            {[
              { id: 'all', label: `All (${items.length})` },
              { id: 'missing', label: `Missing (${items.filter((i) => !i.hasNfo).length})` },
              { id: 'warnings', label: `Warnings (${items.filter((i) => i.hasNfo && i.warnings.length > 0).length})` },
              { id: 'valid', label: `Valid (${items.filter((i) => i.hasNfo && i.nfoValid && i.warnings.length === 0).length})` },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as typeof filter)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                  filter === f.id ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-slate-900 text-slate-400'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto divide-y divide-slate-800/70">
            {filtered.map((item) => {
              const active = selected?.mediaType === item.mediaType && selected?.mediaId === item.mediaId;
              return (
                <button
                  key={`${item.mediaType}-${item.mediaId}`}
                  onClick={() => openItem(item)}
                  className={`w-full p-3 text-left text-xs flex items-center justify-between gap-2 cursor-pointer ${
                    active ? 'bg-sky-500/15' : 'hover:bg-slate-900/70'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 uppercase text-[9px] font-bold">
                        {item.mediaType}
                      </span>
                      <span className="font-semibold text-slate-100 truncate">{item.title}</span>
                    </div>
                    <div className="text-[10px] font-mono text-slate-500 truncate mt-0.5">{item.nfoPath || 'No NFO on disk'}</div>
                  </div>
                  {!item.hasNfo ? (
                    <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-300 text-[10px] font-bold shrink-0">Missing</span>
                  ) : item.warnings.length > 0 ? (
                    <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 text-[10px] font-bold shrink-0">
                      {item.warnings.length} Warn
                    </span>
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Right XML Editor */}
        <div className="lg:col-span-7 rounded-2xl bg-[#111827] border border-slate-800 p-4 space-y-3">
          {!selected ? (
            <div className="py-20 text-center text-sm text-slate-500">Select a library item to inspect its Kodi NFO XML.</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <FileCode2 className="w-4 h-4 text-sky-400" />
                    {selected.title}
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    {nfoPath} {!existsOnDisk && <span className="text-amber-300">(Preview — not yet written to disk)</span>}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => setValidation(await api.validateNfo(xml))}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    Validate
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={busy}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> Write to Disk
                  </button>
                </div>
              </div>

              {validation && (
                <div
                  className={`p-3 rounded-xl border text-xs space-y-1 ${
                    validation.valid && validation.warnings.length === 0
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : validation.valid
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  }`}
                >
                  <div className="font-semibold flex items-center gap-2">
                    {validation.valid ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    Root &lt;{validation.rootElement ?? 'none'}&gt; • {validation.kodiVersionTarget} •{' '}
                    {validation.hasUniqueIdDefault ? 'UniqueID OK' : 'Missing Default UniqueID'} •{' '}
                    {validation.hasRatingsBlock ? 'Multi-Ratings OK' : 'No <ratings> Block'}
                  </div>
                  {validation.errors.map((e, i) => <div key={i}>• Error: {e}</div>)}
                  {validation.warnings.map((w, i) => <div key={i}>• Warning: {w}</div>)}
                </div>
              )}

              <textarea
                value={xml}
                onChange={(e) => setXml(e.target.value)}
                rows={22}
                spellCheck={false}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-200 leading-relaxed"
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};
