import React, { useEffect, useState } from 'react';
import { Check, Image as ImageIcon, Link2, RefreshCw, Sparkles, X } from 'lucide-react';
import type { ArtworkCandidate, ArtworkKind } from '../../shared/types.js';
import { api } from '../lib/api.js';
import { useEscapeKey } from '../lib/useEscapeKey.js';
import { FileDropZone } from './FileDropZone.js';
import { PosterImage } from './PosterImage.js';

export interface ArtworkPickerTarget {
  mediaType: 'movie' | 'tvshow' | 'season' | 'episode';
  mediaId: number;
  mediaTitle: string;
  kind: ArtworkKind;
  label: string;
  aspect: 'poster' | 'fanart' | 'banner' | 'square' | 'logo';
  currentPath: string | null | undefined;
  initialCandidates?: ArtworkCandidate[];
}

export const ClickableArtCard: React.FC<{
  label: string;
  filePath: string | null | undefined;
  aspect: 'poster' | 'fanart' | 'banner' | 'square' | 'logo';
  cacheKey?: number;
  statusLabel?: string;
  onClick: () => void;
}> = ({ label, filePath, aspect, cacheKey, statusLabel, onClick }) => {
  const present = Boolean(filePath);
  return (
    <div className="p-2.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold text-slate-200 truncate">{label}</span>
        <span
          className={`text-[10px] px-1.5 py-0.5 rounded font-semibold shrink-0 ${
            present ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
          }`}
        >
          {statusLabel ?? (present ? 'Present' : 'Missing')}
        </span>
      </div>
      <button
        type="button"
        onClick={onClick}
        title={`Click to change ${label}`}
        className="group relative block w-full rounded-lg overflow-hidden border border-transparent hover:border-sky-500/60 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-sky-500/50"
      >
        <PosterImage filePath={filePath} alt={label} aspect={aspect} cacheKey={cacheKey} className="w-full" />
        <div className="pointer-events-none absolute inset-0 bg-slate-950/55 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
          <span className="px-2.5 py-1 rounded-md bg-slate-900/90 border border-sky-500/50 text-sky-200 text-[11px] font-semibold shadow-lg">
            Choose Artwork...
          </span>
        </div>
      </button>
    </div>
  );
};

interface ArtworkPickerModalProps {
  target: ArtworkPickerTarget | null;
  cacheKey?: number;
  onApply: (opts: { url?: string; dataBase64?: string }) => Promise<void> | void;
  onClose: () => void;
}

export const ArtworkPickerModal: React.FC<ArtworkPickerModalProps> = ({
  target,
  cacheKey,
  onApply,
  onClose,
}) => {
  const [candidates, setCandidates] = useState<ArtworkCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [applyingKey, setApplyingKey] = useState<string | null>(null);
  const [urlInput, setUrlInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEscapeKey(Boolean(target), onClose);

  const fetchCandidates = async (refresh = false) => {
    if (!target) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.getArtworkCandidates({
        mediaType: target.mediaType,
        mediaId: target.mediaId,
        kind: target.kind,
        refresh,
      });
      setCandidates(res.candidates);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!target) return;
    setUrlInput('');
    setError(null);
    setCandidates(target.initialCandidates ?? []);
    void fetchCandidates(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.mediaType, target?.mediaId, target?.kind]);

  if (!target) return null;

  const runApply = async (key: string, opts: { url?: string; dataBase64?: string }) => {
    setApplyingKey(key);
    setError(null);
    try {
      await onApply(opts);
      onClose();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setApplyingKey(null);
    }
  };

  const gridColsClass =
    target.aspect === 'poster'
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'
      : target.aspect === 'square'
        ? 'grid-cols-2 sm:grid-cols-3'
        : 'grid-cols-1 sm:grid-cols-2';

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-[#111827] border border-slate-700/80 rounded-2xl w-full max-w-4xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]">
        {/* Header */}
        <div className="relative pl-5 pr-14 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-bold text-slate-100 flex items-center gap-2">
              <ImageIcon className="w-4 h-4 text-sky-400" />
              Choose {target.label}
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">{target.mediaTitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || Boolean(applyingKey)}
              onClick={() => void fetchCandidates(true)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-sky-400 ${loading ? 'animate-spin' : ''}`} />
              {loading ? 'Loading...' : 'Refresh Scrapers'}
            </button>
            <button
              type="button"
              onClick={() => void runApply('generate', {})}
              disabled={Boolean(applyingKey)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-amber-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {applyingKey === 'generate' ? 'Generating...' : 'Auto-Generate'}
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            title="Close (Esc)"
            className="absolute top-3.5 right-4 p-1.5 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Custom URL + Drag & Drop Upload Controls */}
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-stretch">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (urlInput.trim()) void runApply('url', { url: urlInput.trim() });
              }}
              className="flex flex-col justify-center gap-1.5 p-2.5 rounded-xl bg-slate-950/70 border border-slate-800"
            >
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5 text-sky-400" /> Fetch from Image URL
              </label>
              <div className="flex gap-2">
                <input
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://image.tmdb.org/t/p/original/..."
                  className="flex-1 min-w-0 bg-slate-900 border border-slate-700 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                />
                <button
                  type="submit"
                  disabled={!urlInput.trim() || Boolean(applyingKey)}
                  className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 text-white text-xs font-bold cursor-pointer shrink-0"
                >
                  {applyingKey === 'url' ? 'Applying...' : 'Apply URL'}
                </button>
              </div>
            </form>

            <FileDropZone
              accept="image/png,image/jpeg,image/webp"
              label={
                applyingKey === 'upload'
                  ? 'Uploading artwork...'
                  : 'Drag & drop a local image here, or click to browse'
              }
              sublabel="Supports PNG, JPEG, WebP — writes directly to Kodi folder"
              disabled={Boolean(applyingKey)}
              onFileLoaded={({ content }) => runApply('upload', { dataBase64: content })}
            />
          </div>

          {error && (
            <div className="text-xs text-rose-300 bg-rose-500/15 border border-rose-500/30 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Scraped Image Options & Current Image */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {target.currentPath && (
            <div className="space-y-2">
              <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Current Active Image
              </div>
              <div className="max-w-xs p-2.5 rounded-xl bg-slate-900/90 border border-emerald-500/40 space-y-2">
                <PosterImage
                  filePath={target.currentPath}
                  alt={`Current ${target.label}`}
                  aspect={target.aspect}
                  cacheKey={cacheKey}
                  className="w-full"
                />
                <div className="text-[10px] font-mono text-emerald-300 truncate">{target.currentPath}</div>
              </div>
            </div>
          )}

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Scraped Artwork Options ({candidates.length})
              </span>
              <span className="text-[11px] text-slate-500">Click any image below to save it to disk</span>
            </div>

            {loading && candidates.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                Fetching scraped artwork options...
              </div>
            ) : candidates.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-800 rounded-xl">
                No scraped candidates found yet. Paste an image URL or drag and drop a file above.
              </div>
            ) : (
              <div className={`grid ${gridColsClass} gap-3.5`}>
                {candidates.map((cand, idx) => {
                  const key = `cand:${idx}`;
                  const busyThis = applyingKey === key;
                  return (
                    <button
                      key={`${cand.provider}-${cand.url}-${idx}`}
                      type="button"
                      disabled={Boolean(applyingKey)}
                      onClick={() => void runApply(key, { url: cand.url })}
                      className="group text-left p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800/90 border border-slate-800 hover:border-sky-500/60 transition space-y-2 cursor-pointer disabled:opacity-60"
                    >
                      <div className="relative overflow-hidden rounded-lg">
                        <PosterImage
                          filePath={cand.url}
                          alt={cand.label || `${cand.provider} ${target.label}`}
                          aspect={target.aspect}
                          className="w-full"
                        />
                        <div className="absolute inset-0 bg-slate-950/60 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
                          <span className="px-3 py-1.5 rounded-lg bg-sky-500 text-white text-xs font-bold inline-flex items-center gap-1 shadow-lg">
                            <Check className="w-3.5 h-3.5" />
                            {busyThis ? 'Saving...' : 'Use Image'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[11px]">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 font-bold uppercase text-[10px]">
                          {cand.provider}
                        </span>
                        {cand.width && cand.height ? (
                          <span className="font-mono text-slate-400 text-[10px]">
                            {cand.width}×{cand.height}
                          </span>
                        ) : null}
                      </div>
                      {cand.label && (
                        <div className="text-[11px] text-slate-300 truncate">{cand.label}</div>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
