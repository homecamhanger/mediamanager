import React, { useEffect, useState } from 'react';
import {
  Check,
  Code2,
  Eye,
  EyeOff,
  FileCode2,
  FolderSync,
  Image as ImageIcon,
  Info,
  Languages,
  Save,
  Sparkles,
  Star,
  Subtitles,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { ArtworkKind, MovieRecord, NfoValidationReport } from '../../shared/types.js';
import { api, formatBytes, getArtworkUrl } from '../lib/api.js';
import { useEscapeKey } from '../lib/useEscapeKey.js';
import { PosterImage } from './PosterImage.js';
import { TechBadges } from './QualityBadges.js';
import { RatingBadges } from './RatingBadges.js';
import { ScrapeModal } from './ScrapeModal.js';
import { SubtitleEditorModal, SubtitleSearchModal } from './SubtitleSearchModal.js';

type DetailTab = 'metadata' | 'artwork' | 'subtitles' | 'nfo' | 'mediainfo';

const ARTWORK_SLOTS: Array<{ kind: ArtworkKind; label: string; aspect: 'poster' | 'fanart' | 'banner' | 'square' | 'logo' }> = [
  { kind: 'poster', label: 'Poster (2:3)', aspect: 'poster' },
  { kind: 'fanart', label: 'Fanart Backdrop (16:9)', aspect: 'fanart' },
  { kind: 'clearlogo', label: 'HD ClearLOGO (PNG)', aspect: 'logo' },
  { kind: 'clearart', label: 'HD ClearART (PNG)', aspect: 'fanart' },
  { kind: 'disc', label: 'Optical DiscART (PNG)', aspect: 'square' },
  { kind: 'banner', label: 'Wide Banner', aspect: 'banner' },
  { kind: 'landscape', label: 'Landscape Thumb (16:9)', aspect: 'fanart' },
];

export const MovieDetailModal: React.FC<{
  movieId: number | null;
  onUpdated: () => void;
  onClose: () => void;
}> = ({ movieId, onUpdated, onClose }) => {
  const [movie, setMovie] = useState<MovieRecord | null>(null);
  const [tab, setTab] = useState<DetailTab>('metadata');
  const [saving, setSaving] = useState(false);
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [subSearchOpen, setSubSearchOpen] = useState(false);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [artCacheKey, setArtCacheKey] = useState(0);

  // Form states
  const [form, setForm] = useState<Partial<MovieRecord>>({});
  const [nfoXml, setNfoXml] = useState('');
  const [nfoVal, setNfoVal] = useState<NfoValidationReport | null>(null);
  const [customArtUrl, setCustomArtUrl] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<string | null>(null);

  const loadMovie = async () => {
    if (!movieId) return;
    const res = await api.getMovie(movieId);
    setMovie(res.movie);
    setForm(res.movie);
    setArtCacheKey((k) => k + 1);
    const nfo = await api.readNfo('movie', movieId);
    setNfoXml(nfo.xml);
    setNfoVal(nfo.validation);
  };

  useEffect(() => {
    if (movieId) {
      setTab('metadata');
      void loadMovie();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId]);

  const hasChildModal = scrapeOpen || subSearchOpen || editSubId !== null;
  useEscapeKey(Boolean(movieId) && !hasChildModal, onClose);

  if (!movieId || !movie) return null;

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const handleSaveMetadata = async () => {
    setSaving(true);
    try {
      await api.updateMovie(movie.id, {
        title: form.title,
        originalTitle: form.originalTitle,
        sortTitle: form.sortTitle,
        year: form.year ? Number(form.year) : null,
        premiered: form.premiered || null,
        tagline: form.tagline,
        plot: form.plot,
        outline: form.outline,
        runtimeMinutes: form.runtimeMinutes ? Number(form.runtimeMinutes) : null,
        mpaa: form.mpaa,
        country: form.country,
        trailerUrl: form.trailerUrl,
        genres: form.genres,
        tags: form.tags,
        directors: form.directors,
        writers: form.writers,
        studios: form.studios,
        setName: form.setName ?? null,
        uniqueIds: form.uniqueIds,
        userRating: form.userRating ? Number(form.userRating) : null,
        watched: form.watched,
        playCount: form.watched ? Math.max(1, form.playCount ?? 1) : 0,
        writeNfo: true,
      });
      await loadMovie();
      onUpdated();
      notify('Metadata saved & Kodi NFO updated');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNfo = async () => {
    setSaving(true);
    try {
      const res = await api.saveNfo('movie', movie.id, nfoXml);
      setNfoVal(res.validation);
      await loadMovie();
      onUpdated();
      notify('NFO XML validated and written to disk');
    } catch (e) {
      notify(`Validation error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handlePickArtwork = async (kind: ArtworkKind, url?: string) => {
    await api.setMovieArtwork(movie.id, kind, url);
    await loadMovie();
    onUpdated();
    notify(`Updated ${kind} artwork`);
  };

  const handleQuickRename = async () => {
    const prev = await api.previewRename({ movieIds: [movie.id] });
    const item = prev.items[0];
    if (!item?.hasChanges) {
      notify('File already matches Kodi rename pattern');
      return;
    }
    if (item.conflict) {
      notify(`Rename conflict: ${item.conflict}`);
      return;
    }
    await api.executeRename([item], true);
    await loadMovie();
    onUpdated();
    notify('Movie & sidecars renamed cleanly');
  };

  const fanartUrl = getArtworkUrl(movie.artwork.fanart, artCacheKey);

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-[#0f1522] border border-slate-700/80 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Hero Header */}
        <div className="relative border-b border-slate-800">
          {fanartUrl && (
            <div
              className="absolute inset-0 bg-cover bg-center opacity-25"
              style={{ backgroundImage: `url("${fanartUrl}")` }}
            />
          )}
          <div className="relative bg-gradient-to-r from-[#0b0f17]/95 via-[#0f1522]/90 to-[#0f1522]/85 pl-6 pr-16 py-4 flex flex-wrap items-center justify-between gap-4">
            <button
              onClick={onClose}
              aria-label="Close modal"
              title="Close (Esc)"
              className="absolute top-3.5 right-4 z-20 p-2 rounded-lg text-slate-300 bg-slate-900/75 hover:bg-slate-800 hover:text-white border border-slate-700/70 cursor-pointer transition"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="w-16 shrink-0">
                <PosterImage filePath={movie.artwork.poster} alt={movie.title} cacheKey={artCacheKey} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-white truncate">{movie.title}</h2>
                  {movie.year && <span className="text-slate-400 text-base">({movie.year})</span>}
                  {movie.mpaa && (
                    <span className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-xs font-semibold text-slate-300">
                      {movie.mpaa}
                    </span>
                  )}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3">
                  <RatingBadges ratings={movie.ratings} />
                  <TechBadges parsed={movie.parsedInfo} streamDetails={movie.streamDetails} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                onClick={() => setScrapeOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" /> Scrape Metadata
              </button>
              <button
                onClick={handleQuickRename}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FolderSync className="w-3.5 h-3.5 text-emerald-400" /> Auto-Rename
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="relative px-6 bg-[#0b0f17]/80 flex items-center gap-1 overflow-x-auto border-t border-slate-800/80">
            {[
              { id: 'metadata', label: 'Metadata & Cast', icon: <Info className="w-3.5 h-3.5" /> },
              { id: 'artwork', label: 'Kodi Artwork', icon: <ImageIcon className="w-3.5 h-3.5" /> },
              { id: 'subtitles', label: `Subtitles (${movie.subtitles.length})`, icon: <Subtitles className="w-3.5 h-3.5" /> },
              { id: 'nfo', label: 'NFO XML Editor', icon: <Code2 className="w-3.5 h-3.5" /> },
              { id: 'mediainfo', label: 'MediaInfo & Paths', icon: <FileCode2 className="w-3.5 h-3.5" /> },
            ].map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id as DetailTab)}
                className={`px-3.5 py-2.5 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
                  tab === t.id ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
            {toast && (
              <span className="ml-auto text-xs text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-md">
                {toast}
              </span>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'metadata' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field label="Title" value={form.title ?? ''} onChange={(v) => setForm({ ...form, title: v })} />
                  <Field
                    label="Original Title"
                    value={form.originalTitle ?? ''}
                    onChange={(v) => setForm({ ...form, originalTitle: v })}
                  />
                  <Field label="Sort Title" value={form.sortTitle ?? ''} onChange={(v) => setForm({ ...form, sortTitle: v })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Year"
                      type="number"
                      value={form.year != null ? String(form.year) : ''}
                      onChange={(v) => setForm({ ...form, year: v ? Number(v) : null })}
                    />
                    <Field
                      label="Runtime (min)"
                      type="number"
                      value={form.runtimeMinutes != null ? String(form.runtimeMinutes) : ''}
                      onChange={(v) => setForm({ ...form, runtimeMinutes: v ? Number(v) : null })}
                    />
                  </div>
                  <Field label="Premiered (YYYY-MM-DD)" value={form.premiered ?? ''} onChange={(v) => setForm({ ...form, premiered: v })} />
                  <Field label="MPAA Certification" value={form.mpaa ?? ''} onChange={(v) => setForm({ ...form, mpaa: v })} />
                  <Field label="Movie Set / Collection" value={form.setName ?? ''} onChange={(v) => setForm({ ...form, setName: v || null })} />
                  <Field label="Country" value={form.country ?? ''} onChange={(v) => setForm({ ...form, country: v })} />
                </div>

                <Field label="Tagline" value={form.tagline ?? ''} onChange={(v) => setForm({ ...form, tagline: v })} />

                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Plot Synopsis</label>
                  <textarea
                    rows={4}
                    value={form.plot ?? ''}
                    onChange={(e) => setForm({ ...form, plot: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Field
                    label="Genres (comma separated)"
                    value={(form.genres ?? []).join(', ')}
                    onChange={(v) => setForm({ ...form, genres: v.split(',').map((s) => s.trim()).filter(Boolean) })}
                  />
                  <Field
                    label="Tags (comma separated)"
                    value={(form.tags ?? []).join(', ')}
                    onChange={(v) => setForm({ ...form, tags: v.split(',').map((s) => s.trim()).filter(Boolean) })}
                  />
                  <Field
                    label="Directors (comma separated)"
                    value={(form.directors ?? []).join(', ')}
                    onChange={(v) => setForm({ ...form, directors: v.split(',').map((s) => s.trim()).filter(Boolean) })}
                  />
                  <Field
                    label="Studios (comma separated)"
                    value={(form.studios ?? []).join(', ')}
                    onChange={(v) => setForm({ ...form, studios: v.split(',').map((s) => s.trim()).filter(Boolean) })}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field
                    label="IMDb ID"
                    value={form.uniqueIds?.imdb ?? ''}
                    onChange={(v) => setForm({ ...form, uniqueIds: { ...(form.uniqueIds ?? {}), imdb: v || undefined } })}
                  />
                  <Field
                    label="TMDb ID"
                    value={form.uniqueIds?.tmdb ?? ''}
                    onChange={(v) => setForm({ ...form, uniqueIds: { ...(form.uniqueIds ?? {}), tmdb: v || undefined } })}
                  />
                  <Field label="Trailer URL" value={form.trailerUrl ?? ''} onChange={(v) => setForm({ ...form, trailerUrl: v })} />
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-4">
                    <button
                      type="button"
                      onClick={() => setForm({ ...form, watched: !form.watched })}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
                        form.watched
                          ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                          : 'bg-slate-900 border-slate-700 text-slate-400'
                      }`}
                    >
                      {form.watched ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      {form.watched ? 'Watched' : 'Unwatched'}
                    </button>
                    <div className="flex items-center gap-1.5">
                      <Star className="w-3.5 h-3.5 text-amber-400" />
                      <span className="text-xs text-slate-400">Your Rating:</span>
                      <input
                        type="number"
                        min={1}
                        max={10}
                        value={form.userRating ?? ''}
                        onChange={(e) => setForm({ ...form, userRating: e.target.value ? Number(e.target.value) : null })}
                        className="w-16 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSaveMetadata}
                    disabled={saving}
                    className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving...' : 'Save & Write NFO'}
                  </button>
                </div>
              </div>

              {/* Cast Column */}
              <div className="space-y-3">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-sky-400" /> Cast ({movie.actors.length})
                </div>
                <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                  {movie.actors.length === 0 ? (
                    <div className="text-xs text-slate-500 bg-slate-900/60 border border-slate-800 rounded-xl p-4">
                      No cast scraped yet. Click “Scrape Metadata” to populate cast & crew.
                    </div>
                  ) : (
                    movie.actors.map((a, idx) => (
                      <div key={`${a.name}-${idx}`} className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-2">
                        <div>
                          <div className="text-xs font-semibold text-slate-100">{a.name}</div>
                          <div className="text-[11px] text-slate-400">{a.role || 'Actor'}</div>
                        </div>
                        <span className="text-[10px] text-slate-500">#{a.order + 1}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {tab === 'artwork' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {ARTWORK_SLOTS.map((slot) => {
                const current = movie.artwork[slot.kind];
                const candidates = movie.artworkCandidates?.[slot.kind] ?? [];
                return (
                  <div key={slot.kind} className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">{slot.label}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${current ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>
                        {current ? 'Present' : 'Missing'}
                      </span>
                    </div>
                    <PosterImage filePath={current} alt={slot.label} aspect={slot.aspect} cacheKey={artCacheKey} className="w-full" />
                    <div className="flex gap-1.5">
                      <input
                        value={customArtUrl[slot.kind] ?? ''}
                        onChange={(e) => setCustomArtUrl((p) => ({ ...p, [slot.kind]: e.target.value }))}
                        placeholder="Image URL (or leave blank to auto-generate)"
                        className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-[11px] text-slate-200"
                      />
                      <button
                        onClick={() => handlePickArtwork(slot.kind, customArtUrl[slot.kind] || undefined)}
                        className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 text-[11px] font-semibold cursor-pointer"
                      >
                        {customArtUrl[slot.kind] ? 'Fetch' : 'Generate'}
                      </button>
                    </div>
                    {candidates.length > 0 && (
                      <div className="flex gap-1.5 overflow-x-auto pt-1">
                        {candidates.map((c, idx) => (
                          <button
                            key={idx}
                            onClick={() => handlePickArtwork(slot.kind, c.url)}
                            className="shrink-0 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 cursor-pointer"
                          >
                            Use {c.provider.toUpperCase()} #{idx + 1}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'subtitles' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-100">Attached Sidecar Subtitles</h4>
                  <p className="text-xs text-slate-400">OpenSubtitles 64-bit hash: <code className="text-sky-300">{movie.movieHash}</code></p>
                </div>
                <button
                  onClick={() => setSubSearchOpen(true)}
                  className="px-3.5 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Languages className="w-3.5 h-3.5" /> Search & Download Subtitles
                </button>
              </div>

              {movie.subtitles.length === 0 ? (
                <div className="p-8 rounded-xl border border-dashed border-slate-700 text-center text-sm text-slate-400">
                  No subtitle files found beside this movie yet. Click “Search & Download Subtitles” to fetch synced `.srt` subtitles.
                </div>
              ) : (
                <div className="space-y-2">
                  {movie.subtitles.map((s) => (
                    <div key={s.id} className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-xs font-bold uppercase">{s.language}</span>
                          {s.forced && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">FORCED</span>}
                          {s.sdh && <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">SDH</span>}
                          <span className="text-xs text-slate-400">{s.cueCount ?? 0} cues • {formatBytes(s.sizeBytes)}</span>
                        </div>
                        <div className="text-xs font-mono text-slate-200 mt-1">{s.fileName}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setEditSubId(s.id)}
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold cursor-pointer"
                        >
                          Preview & Sync
                        </button>
                        <button
                          onClick={async () => {
                            await api.deleteSubtitle(s.id);
                            await loadMovie();
                            onUpdated();
                          }}
                          className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'nfo' && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-xs text-slate-400">
                  Target file: <code className="text-sky-300">{movie.nfoPath ?? 'movie.nfo (will be created)'}</code>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const rep = await api.validateNfo(nfoXml);
                      setNfoVal(rep);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    Validate XML
                  </button>
                  <button
                    onClick={handleSaveNfo}
                    disabled={saving}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> Save NFO to Disk
                  </button>
                </div>
              </div>

              {nfoVal && (
                <div
                  className={`p-3 rounded-xl border text-xs ${
                    nfoVal.valid && nfoVal.warnings.length === 0
                      ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
                      : nfoVal.valid
                        ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                  }`}
                >
                  <div className="font-semibold">
                    {nfoVal.kodiVersionTarget} Schema: {nfoVal.valid ? 'Valid XML' : 'Invalid XML'}
                  </div>
                  {nfoVal.errors.map((e, i) => <div key={i}>• Error: {e}</div>)}
                  {nfoVal.warnings.map((w, i) => <div key={i}>• Warning: {w}</div>)}
                </div>
              )}

              <textarea
                value={nfoXml}
                onChange={(e) => setNfoXml(e.target.value)}
                rows={18}
                spellCheck={false}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-200 leading-relaxed"
              />
            </div>
          )}

          {tab === 'mediainfo' && (
            <div className="space-y-4 text-xs">
              <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="font-semibold text-slate-200">File Location & Identifiers</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-400">
                  <div>Video File: <code className="text-slate-200 break-all">{movie.filePath}</code></div>
                  <div>Folder: <code className="text-slate-200 break-all">{movie.folderPath}</code></div>
                  <div>File Size: <span className="text-slate-200">{formatBytes(movie.fileSizeBytes)}</span></div>
                  <div>OpenSubtitles Hash: <code className="text-sky-300">{movie.movieHash}</code></div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="font-semibold text-slate-200">Video Streams</div>
                  {movie.streamDetails.video.map((v, i) => (
                    <div key={i} className="text-slate-400 space-y-1">
                      <div>Codec: <span className="text-slate-100">{v.codec}</span></div>
                      <div>Resolution: <span className="text-slate-100">{v.width} × {v.height} (Aspect {v.aspect})</span></div>
                      <div>Duration: <span className="text-slate-100">{Math.round(v.durationSeconds / 60)} min ({v.durationSeconds}s)</span></div>
                      {v.hdrType && <div>HDR: <span className="text-purple-300">{v.hdrType}</span></div>}
                    </div>
                  ))}
                </div>
                <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="font-semibold text-slate-200">Audio Streams</div>
                  {movie.streamDetails.audio.map((a, i) => (
                    <div key={i} className="text-slate-400 space-y-1">
                      <div>Codec: <span className="text-slate-100">{a.codec}</span></div>
                      <div>Channels: <span className="text-slate-100">{a.channels} ch</span></div>
                      <div>Language: <span className="text-slate-100 uppercase">{a.language}</span></div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <ScrapeModal
        open={scrapeOpen}
        mediaKind="movie"
        mediaId={movie.id}
        initialQuery={movie.parsedInfo.cleanTitle || movie.title}
        initialYear={movie.year ?? movie.parsedInfo.year}
        onApplied={() => {
          void loadMovie();
          onUpdated();
        }}
        onClose={() => setScrapeOpen(false)}
      />

      <SubtitleSearchModal
        open={subSearchOpen}
        mediaType="movie"
        mediaId={movie.id}
        mediaTitle={`${movie.title}${movie.year ? ` (${movie.year})` : ''}`}
        onDownloaded={() => {
          void loadMovie();
          onUpdated();
        }}
        onClose={() => setSubSearchOpen(false)}
      />

      <SubtitleEditorModal
        subtitleId={editSubId}
        onUpdated={() => {
          void loadMovie();
          onUpdated();
        }}
        onClose={() => setEditSubId(null)}
      />
    </div>
  );
};

const Field: React.FC<{
  label: string;
  value: string;
  onChange: (val: string) => void;
  type?: string;
}> = ({ label, value, onChange, type = 'text' }) => (
  <div>
    <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-400 mb-1">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-sm text-slate-100"
    />
  </div>
);
