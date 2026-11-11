import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
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
  Tag,
  Trash2,
  Tv,
  Users,
} from 'lucide-react';
import type { ActorEntry, ArtworkKind, MovieRecord, NfoValidationReport } from '../../shared/types.js';
import { api, formatBytes, getArtworkUrl } from '../lib/api.js';
import type { InspectorFocusTab } from '../lib/workspaceTypes.js';
import { ArtworkPickerModal, ArtworkPickerTarget, ClickableArtCard } from './ArtworkPickerModal.js';
import { CastListColumn } from './CastListColumn.js';
import { DetailHero, HeroChip, HeroTab, HeroTitle } from './DetailHero.js';
import { useLibraryVocabulary } from '../lib/useLibraryVocabulary.js';
import { ChipInput } from './ChipInput.js';
import { FileDropZone } from './FileDropZone.js';
import { FormField as Field } from './FormField.js';
import { PosterImage } from './PosterImage.js';
import { TechBadges } from './QualityBadges.js';
import { RatingBadges } from './RatingBadges.js';
import { ScrapeModal } from './ScrapeModal.js';
import { SubtitleEditorModal, SubtitleSearchModal } from './SubtitleSearchModal.js';

type DetailTab = 'metadata' | 'cast' | 'nfo' | 'mediainfo';

const OTHER_ARTWORK_SLOTS: Array<{ kind: ArtworkKind; label: string; aspect: 'poster' | 'fanart' | 'banner' | 'square' | 'logo' }> = [
  { kind: 'fanart', label: 'Fanart Backdrop (16:9)', aspect: 'fanart' },
  { kind: 'clearlogo', label: 'HD ClearLOGO (PNG)', aspect: 'logo' },
  { kind: 'clearart', label: 'HD ClearART (PNG)', aspect: 'fanart' },
  { kind: 'disc', label: 'Optical DiscART (PNG)', aspect: 'square' },
  { kind: 'banner', label: 'Wide Banner', aspect: 'banner' },
  { kind: 'landscape', label: 'Landscape Thumb (16:9)', aspect: 'fanart' },
];

function resolveMovieTab(tab?: DetailTab | InspectorFocusTab): DetailTab {
  if (tab === 'subtitles' || tab === 'mediainfo') return 'mediainfo';
  if (tab === 'nfo') return 'nfo';
  if (tab === 'cast') return 'cast';
  return 'metadata';
}

export const MovieDetailPanel: React.FC<{
  movieId: number;
  initialTab?: DetailTab | InspectorFocusTab;
  activeActor?: string | null;
  onSelectActor?: (actorName: string) => void;
  onUpdated: () => void;
  onDeleted?: () => void;
  onClose?: () => void;
}> = ({ movieId, initialTab, activeActor, onSelectActor, onUpdated, onDeleted, onClose }) => {
  const [movie, setMovie] = useState<MovieRecord | null>(null);
  const [tab, setTab] = useState<DetailTab>(resolveMovieTab(initialTab));
  const [saving, setSaving] = useState(false);
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [subSearchOpen, setSubSearchOpen] = useState(false);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [artCacheKey, setArtCacheKey] = useState(0);

  const [form, setForm] = useState<Partial<MovieRecord>>({});
  const [nfoXml, setNfoXml] = useState('');
  const [nfoVal, setNfoVal] = useState<NfoValidationReport | null>(null);
  const [artPickerTarget, setArtPickerTarget] = useState<ArtworkPickerTarget | null>(null);
  const [uploadSubLang, setUploadSubLang] = useState('en');
  const [editionDraft, setEditionDraft] = useState('');
  const [confirmDeleteMode, setConfirmDeleteMode] = useState<'db' | 'files' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const vocabulary = useLibraryVocabulary();

  const loadMovie = async () => {
    const res = await api.getMovie(movieId);
    setMovie(res.movie);
    setForm(res.movie);
    setEditionDraft(res.movie.parsedInfo.edition ?? '');
    setConfirmDeleteMode(null);
    setArtCacheKey((k) => k + 1);
    const nfo = await api.readNfo('movie', movieId);
    setNfoXml(nfo.xml);
    setNfoVal(nfo.validation);
  };

  useEffect(() => {
    setTab(resolveMovieTab(initialTab));
    void loadMovie();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [movieId, initialTab]);

  useEffect(() => {
    if (initialTab === 'artwork') {
      const id = setTimeout(() => {
        document.getElementById('movie-artwork-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => clearTimeout(id);
    }
    if (initialTab === 'subtitles') {
      const id = setTimeout(() => {
        document.getElementById('movie-subtitles-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => clearTimeout(id);
    }
  }, [initialTab, movieId]);

  if (!movie) {
    return <div className="p-6 text-xs text-slate-400">Loading movie details...</div>;
  }

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

  const handlePickArtwork = async (kind: ArtworkKind, url?: string, dataBase64?: string) => {
    await api.setMovieArtwork(movie.id, kind, url, dataBase64);
    await loadMovie();
    onUpdated();
    notify(`Updated ${kind} artwork`);
  };

  const handleSaveActors = async (actors: ActorEntry[]) => {
    await api.updateMovie(movie.id, { actors, writeNfo: true });
    await loadMovie();
    onUpdated();
    notify(`Saved ${actors.length} cast member(s) & updated NFO`);
  };

  const handleUploadActorThumb = async (actorName: string, dataBase64: string) => {
    const res = await api.uploadActorThumb({
      mediaType: 'movie',
      mediaId: movie.id,
      actorName,
      dataBase64,
    });
    notify(`Saved portrait to .actors for ${actorName}`);
    return res.thumbPath;
  };

  const handleSaveEdition = async () => {
    await api.setMovieEdition(movie.id, editionDraft);
    await loadMovie();
    onUpdated();
    notify(editionDraft.trim() ? `Tagged edition: ${editionDraft.trim()}` : 'Cleared edition tag');
  };

  const handleDeleteMovie = async (deleteFiles: boolean) => {
    await api.deleteMovie(movie.id, deleteFiles);
    setConfirmDeleteMode(null);
    onUpdated();
    onDeleted?.();
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

  const handleQuickToggleWatched = async () => {
    const nextWatched = !movie.watched;
    await api.updateMovie(movie.id, {
      watched: nextWatched,
      playCount: nextWatched ? Math.max(1, movie.playCount) : 0,
      writeNfo: true,
    });
    await loadMovie();
    onUpdated();
  };

  const handleRefreshInKodi = async () => {
    const res = await api.refreshKodiItem('movie', movie.id);
    notify(res.ok ? `Refreshed "${movie.title}" in Kodi` : `Kodi refresh: ${res.error}`);
  };

  const fanartUrl = getArtworkUrl(movie.artwork.fanart, artCacheKey);
  const clearlogoUrl = getArtworkUrl(movie.artwork.clearlogo, artCacheKey);
  const otherArtPresentCount = OTHER_ARTWORK_SLOTS.filter((s) => Boolean(movie.artwork[s.kind])).length;

  const openMovieArtPicker = (
    kind: ArtworkKind,
    label: string,
    aspect: 'poster' | 'fanart' | 'banner' | 'square' | 'logo'
  ) => {
    setArtPickerTarget({
      mediaType: 'movie',
      mediaId: movie.id,
      mediaTitle: `${movie.title}${movie.year ? ` (${movie.year})` : ''}`,
      kind,
      label,
      aspect,
      currentPath: movie.artwork[kind],
      initialCandidates: movie.artworkCandidates?.[kind],
    });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      <DetailHero
        fanartUrl={fanartUrl}
        onClose={onClose}
        leading={
          <>
            {tab !== 'metadata' && (
              <div className="w-11 shrink-0 shadow-lg">
                <PosterImage filePath={movie.artwork.poster} alt={movie.title} cacheKey={artCacheKey} compact />
              </div>
            )}
            {clearlogoUrl && (
              <img
                src={clearlogoUrl}
                alt={`${movie.title} logo`}
                className="hidden @lg:block h-8 max-w-[130px] object-contain shrink-0 drop-shadow"
              />
            )}
          </>
        }
        titleArea={
          <HeroTitle>
            {movie.title}
            {movie.year && <span className="ml-2 font-semibold text-slate-400">({movie.year})</span>}
            {movie.mpaa && <HeroChip>{movie.mpaa}</HeroChip>}
            {!movie.scraped && <HeroChip tone="amber">UNSCRAPED</HeroChip>}
          </HeroTitle>
        }
        meta={
          <>
            <RatingBadges ratings={movie.ratings} compact />
            <TechBadges parsed={movie.parsedInfo} streamDetails={movie.streamDetails} />
          </>
        }
        actions={
          <>
            <button
              onClick={handleQuickToggleWatched}
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
                movie.watched
                  ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30'
                  : 'bg-slate-800/90 border-slate-700 text-slate-300 hover:text-white'
              }`}
            >
              {movie.watched ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {movie.watched ? 'Watched' : 'Unwatched'}
            </button>
            <button
              onClick={() => setScrapeOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Scrape
            </button>
            <button
              onClick={handleQuickRename}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <FolderSync className="w-3.5 h-3.5 text-emerald-400" /> Auto-Rename
            </button>
            <button
              onClick={handleRefreshInKodi}
              title="Reload this movie's NFO & artwork in Kodi via JSON-RPC"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Tv className="w-3.5 h-3.5 text-sky-400" /> Kodi Refresh
            </button>
          </>
        }
        tabs={[
          { id: 'metadata' as const, label: 'Metadata & Art', icon: <Info className="w-3.5 h-3.5" /> },
          { id: 'cast' as const, label: `Cast (${movie.actors.length})`, icon: <Users className="w-3.5 h-3.5" /> },
          { id: 'nfo' as const, label: 'NFO XML', icon: <Code2 className="w-3.5 h-3.5" /> },
          {
            id: 'mediainfo' as const,
            label: `MediaInfo & Paths (${movie.subtitles.length} sub${movie.subtitles.length === 1 ? '' : 's'})`,
            icon: <FileCode2 className="w-3.5 h-3.5" />,
          },
        ].map((t) => (
          <HeroTab key={t.id} active={tab === t.id} icon={t.icon} label={t.label} onClick={() => setTab(t.id)} />
        ))}
        toast={toast}
      />

      {/* Dense Body */}
      <div className="flex-1 overflow-y-auto p-4 @xl:p-5 @container">
        {tab === 'metadata' && (
          <div className="space-y-6">
            {/* Top Row: Compact poster rail + metadata fields. The rail is fixed-width
                (and only re-centres itself) so it never scales with the pane and
                dominates the form on narrow inspectors. */}
            <div className="flex flex-wrap items-start gap-3 @md:gap-5">
              <div className="w-28 @md:w-36 @3xl:w-44 shrink-0 space-y-2 @md:sticky @md:top-0">
                <ClickableArtCard
                  label="Poster (2:3)"
                  filePath={movie.artwork.poster}
                  aspect="poster"
                  cacheKey={artCacheKey}
                  onClick={() => openMovieArtPicker('poster', 'Poster (2:3)', 'poster')}
                />
              </div>

              {/* Right Metadata Form Column — flex-1/min-w-0 so it fills every pixel
                  beside the poster and only wraps below it when narrower than its floor. */}
              <div className="min-w-[15rem] flex-1 basis-60 space-y-3 @container">
                <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-2.5">
                  <Field label="Title" value={form.title ?? ''} onChange={(v) => setForm({ ...form, title: v })} />
                  <Field label="Original Title" value={form.originalTitle ?? ''} onChange={(v) => setForm({ ...form, originalTitle: v })} />
                  <Field label="Sort Title" value={form.sortTitle ?? ''} onChange={(v) => setForm({ ...form, sortTitle: v })} />
                  <div className="grid grid-cols-2 gap-2">
                    <Field
                      label="Year"
                      type="number"
                      value={form.year != null ? String(form.year) : ''}
                      onChange={(v) => setForm({ ...form, year: v ? Number(v) : null })}
                    />
                    <Field
                      label="Runtime (m)"
                      type="number"
                      value={form.runtimeMinutes != null ? String(form.runtimeMinutes) : ''}
                      onChange={(v) => setForm({ ...form, runtimeMinutes: v ? Number(v) : null })}
                    />
                  </div>
                  <Field label="Premiered" value={form.premiered ?? ''} onChange={(v) => setForm({ ...form, premiered: v })} />
                  <Field label="MPAA" value={form.mpaa ?? ''} onChange={(v) => setForm({ ...form, mpaa: v })} />
                  <Field label="Movie Set" value={form.setName ?? ''} onChange={(v) => setForm({ ...form, setName: v || null })} />
                  <Field label="Country" value={form.country ?? ''} onChange={(v) => setForm({ ...form, country: v })} />
                  <Field label="Tagline" value={form.tagline ?? ''} onChange={(v) => setForm({ ...form, tagline: v })} />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Plot Synopsis</label>
                  <textarea
                    rows={4}
                    value={form.plot ?? ''}
                    onChange={(e) => setForm({ ...form, plot: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3">
                  <ChipInput
                    label="Genres"
                    values={form.genres ?? []}
                    onChange={(genres) => setForm({ ...form, genres })}
                    suggestions={['Science Fiction', 'Action', 'Drama', 'Thriller', 'Adventure', 'Mystery']}
                    vocabulary={vocabulary?.genres}
                    hideQuickAdd
                    accent="sky"
                  />
                  <ChipInput
                    label="Tags"
                    values={form.tags ?? []}
                    onChange={(tags) => setForm({ ...form, tags })}
                    suggestions={['4K HDR', 'Atmos', 'Director Cut', 'IMAX', 'Favorites']}
                    vocabulary={vocabulary?.tags}
                    hideQuickAdd
                    accent="indigo"
                  />
                  <ChipInput
                    label="Directors"
                    values={form.directors ?? []}
                    onChange={(directors) => setForm({ ...form, directors })}
                    vocabulary={vocabulary?.directors}
                    hideQuickAdd
                    accent="emerald"
                  />
                  <ChipInput
                    label="Writers / Credits"
                    values={form.writers ?? []}
                    onChange={(writers) => setForm({ ...form, writers })}
                    vocabulary={vocabulary?.writers}
                    hideQuickAdd
                    accent="emerald"
                  />
                  <div className="sm:col-span-2">
                    <ChipInput
                      label="Studios"
                      values={form.studios ?? []}
                      onChange={(studios) => setForm({ ...form, studios })}
                      vocabulary={vocabulary?.studios}
                      hideQuickAdd
                      accent="amber"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-2.5">
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
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs text-slate-400">User Rating:</span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={form.userRating ?? ''}
                      onChange={(e) => setForm({ ...form, userRating: e.target.value ? Number(e.target.value) : null })}
                      className="w-14 bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs text-slate-100"
                    />
                  </div>

                  <button
                    onClick={handleSaveMetadata}
                    disabled={saving}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving...' : 'Save & Write NFO'}
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Section: All Other Kodi Artwork Below Metadata Fields */}
            <div id="movie-artwork-section" className="pt-4 border-t border-slate-800/90 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5 text-sky-400" /> Kodi Artwork
                </h3>
                <span className="text-[11px] text-slate-400">
                  {otherArtPresentCount} / {OTHER_ARTWORK_SLOTS.length} present
                </span>
              </div>

              <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-3.5">
                {OTHER_ARTWORK_SLOTS.map((slot) => (
                  <ClickableArtCard
                    key={slot.kind}
                    label={slot.label}
                    filePath={movie.artwork[slot.kind]}
                    aspect={slot.aspect}
                    cacheKey={artCacheKey}
                    onClick={() => openMovieArtPicker(slot.kind, slot.label, slot.aspect)}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'cast' && (
          <CastListColumn
            actors={movie.actors}
            activeActor={activeActor}
            onSelectActor={onSelectActor}
            onSaveActors={handleSaveActors}
            onUploadActorThumb={handleUploadActorThumb}
          />
        )}

        {tab === 'nfo' && (
          <div className="space-y-2.5">
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
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  Validate XML
                </button>
                <button
                  onClick={handleSaveNfo}
                  disabled={saving}
                  className="px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Save NFO to Disk
                </button>
              </div>
            </div>

            {nfoVal && (
              <div
                className={`p-2.5 rounded-xl border text-xs ${
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
                {nfoVal.errors.map((e, i) => (
                  <div key={i}>• Error: {e}</div>
                ))}
                {nfoVal.warnings.map((w, i) => (
                  <div key={i}>• Warning: {w}</div>
                ))}
              </div>
            )}

            <textarea
              value={nfoXml}
              onChange={(e) => setNfoXml(e.target.value)}
              rows={18}
              spellCheck={false}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs font-mono text-emerald-200 leading-relaxed"
            />
          </div>
        )}

        {tab === 'mediainfo' && (
          <div className="space-y-4 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">File Location & Identifiers</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-400">
                <div>Video File: <code className="text-slate-200 break-all">{movie.filePath}</code></div>
                <div>Folder: <code className="text-slate-200 break-all">{movie.folderPath}</code></div>
                <div>File Size: <span className="text-slate-200">{formatBytes(movie.fileSizeBytes)}</span></div>
                <div>OpenSubtitles Hash: <code className="text-sky-300">{movie.movieHash}</code></div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
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
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
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

            {/* Sidecar Subtitles Section (File Data) */}
            <div id="movie-subtitles-section" className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                    <Subtitles className="w-3.5 h-3.5 text-sky-400" /> Sidecar Subtitle Files ({movie.subtitles.length})
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    External .srt/.ass/.vtt tracks matched beside the video file
                  </p>
                </div>
                <button
                  onClick={() => setSubSearchOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Languages className="w-3.5 h-3.5" /> Search &amp; Download Subtitles
                </button>
              </div>

              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 items-center">
                <select
                  value={uploadSubLang}
                  onChange={(e) => setUploadSubLang(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200"
                  title="Subtitle language code (also auto-detected from filename if present)"
                >
                  <option value="en">English (en)</option>
                  <option value="es">Spanish (es)</option>
                  <option value="fr">French (fr)</option>
                  <option value="de">German (de)</option>
                  <option value="ja">Japanese (ja)</option>
                  <option value="ko">Korean (ko)</option>
                  <option value="zh">Chinese (zh)</option>
                  <option value="pt">Portuguese (pt)</option>
                </select>
                <FileDropZone
                  accept=".srt,.vtt,.ass,.ssa,.sub"
                  readAs="text"
                  compact
                  label="Drop local .srt / .vtt / .ass subtitle file or browse"
                  onFileLoaded={async ({ name, content }) => {
                    await api.uploadSubtitle({
                      mediaType: 'movie',
                      mediaId: movie.id,
                      fileName: name,
                      contentText: content,
                      language: uploadSubLang,
                    });
                    await loadMovie();
                    onUpdated();
                    notify(`Uploaded subtitle ${name}`);
                  }}
                />
              </div>

              {movie.subtitles.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-slate-700 text-center text-xs text-slate-400">
                  No subtitle files found beside this movie yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {movie.subtitles.map((s) => (
                    <div key={s.id} className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-xs font-bold uppercase">{s.language}</span>
                          {s.forced && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[10px] font-bold">FORCED</span>}
                          {s.sdh && <span className="px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-300 text-[10px] font-bold">SDH</span>}
                          <span className="text-xs text-slate-400">
                            {s.cueCount ?? 0} cues • {formatBytes(s.sizeBytes)}
                          </span>
                        </div>
                        <div className="text-xs font-mono text-slate-200 mt-1 truncate">{s.fileName}</div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => setEditSubId(s.id)}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold cursor-pointer"
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
                          title="Delete subtitle file"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Edition Tagging & Safe Library / Disk Removal */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-400" /> Edition &amp; Library Actions
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Tag alternate cuts (e.g. Director&apos;s Cut, Extended) to separate intentional releases from duplicates, or safely remove entries.
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={editionDraft}
                  onChange={(e) => setEditionDraft(e.target.value)}
                  placeholder="Edition tag (e.g. Director's Cut, IMAX, Extended)"
                  className="flex-1 min-w-[220px] bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                />
                <button
                  type="button"
                  onClick={handleSaveEdition}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                >
                  Save Edition Tag
                </button>
              </div>

              <div className="pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">
                  Remove from KodiVault database only, or permanently delete media + sidecar files from disk.
                </span>
                {confirmDeleteMode ? (
                  <div className="flex items-center gap-2 bg-rose-500/15 border border-rose-500/40 rounded-lg px-3 py-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                    <span className="text-[11px] text-rose-200 font-semibold">
                      {confirmDeleteMode === 'files'
                        ? 'Delete video, NFO, subs & art from disk?'
                        : 'Remove this movie from KodiVault DB?'}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleDeleteMovie(confirmDeleteMode === 'files')}
                      className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold cursor-pointer"
                    >
                      Confirm
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMode(null)}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMode('db')}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
                    >
                      Remove from Library
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteMode('files')}
                      className="px-2.5 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" /> Delete Files from Disk
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
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

      <ArtworkPickerModal
        target={artPickerTarget}
        cacheKey={artCacheKey}
        onApply={({ url, dataBase64 }) =>
          artPickerTarget ? handlePickArtwork(artPickerTarget.kind, url, dataBase64) : undefined
        }
        onClose={() => setArtPickerTarget(null)}
      />
    </div>
  );
};
