import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
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
  Star,
  Subtitles,
  Trash2,
  Users,
} from 'lucide-react';
import type { ActorEntry, NfoValidationReport, TvEpisodeRecord, TvSeasonRecord, TvShowRecord } from '../../shared/types.js';
import { api, formatBytes, getArtworkUrl } from '../lib/api.js';
import type { InspectorFocusTab } from '../lib/workspaceTypes.js';
import { CastListColumn } from './CastListColumn.js';
import { ChipInput } from './ChipInput.js';
import { FileDropZone } from './FileDropZone.js';
import { PosterImage } from './PosterImage.js';
import { TechBadges } from './QualityBadges.js';
import { SubtitleEditorModal, SubtitleSearchModal } from './SubtitleSearchModal.js';

type EpisodeTab = 'metadata' | 'cast' | 'nfo' | 'mediainfo';

function resolveEpisodeTab(tab?: EpisodeTab | InspectorFocusTab): EpisodeTab {
  if (tab === 'subtitles' || tab === 'mediainfo') return 'mediainfo';
  if (tab === 'nfo') return 'nfo';
  if (tab === 'cast') return 'cast';
  return 'metadata';
}

export const EpisodeDetailPanel: React.FC<{
  showId: number;
  episodeId: number;
  initialTab?: EpisodeTab | InspectorFocusTab;
  activeActor?: string | null;
  onSelectActor?: (actorName: string) => void;
  onSelectShow: (showId: number, seasonNumber?: number | null) => void;
  onUpdated: () => void;
  onDeleted?: () => void;
}> = ({ showId, episodeId, initialTab, activeActor, onSelectActor, onSelectShow, onUpdated, onDeleted }) => {
  const [show, setShow] = useState<TvShowRecord | null>(null);
  const [seasons, setSeasons] = useState<TvSeasonRecord[]>([]);
  const [episode, setEpisode] = useState<TvEpisodeRecord | null>(null);
  const [form, setForm] = useState<Partial<TvEpisodeRecord>>({});
  const [tab, setTab] = useState<EpisodeTab>(resolveEpisodeTab(initialTab));
  const [nfoXml, setNfoXml] = useState('');
  const [nfoVal, setNfoVal] = useState<NfoValidationReport | null>(null);
  const [subSearchOpen, setSubSearchOpen] = useState(false);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [thumbUrlDraft, setThumbUrlDraft] = useState('');
  const [artCacheKey, setArtCacheKey] = useState(0);
  const [uploadSubLang, setUploadSubLang] = useState('en');
  const [confirmDeleteMode, setConfirmDeleteMode] = useState<'db' | 'files' | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    const res = await api.getShow(showId);
    setShow(res.show);
    setSeasons(res.seasons);
    const ep = res.episodes.find((e) => e.id === episodeId) ?? null;
    setEpisode(ep);
    setConfirmDeleteMode(null);
    setArtCacheKey((k) => k + 1);
    if (ep) {
      setForm(ep);
      const nfo = await api.readNfo('episode', ep.id);
      setNfoXml(nfo.xml);
      setNfoVal(nfo.validation);
    }
  };

  useEffect(() => {
    setTab(resolveEpisodeTab(initialTab));
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId, episodeId, initialTab]);

  useEffect(() => {
    if (initialTab === 'subtitles') {
      const id = setTimeout(() => {
        document.getElementById('episode-subtitles-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => clearTimeout(id);
    }
    if (initialTab === 'artwork') {
      const id = setTimeout(() => {
        document.getElementById('episode-artwork-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => clearTimeout(id);
    }
  }, [initialTab, episodeId]);

  if (!show || !episode) {
    return <div className="p-6 text-xs text-slate-400">Loading episode details...</div>;
  }

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const effSeason = episode.displaySeason ?? episode.seasonNumber;
  const effEp = episode.displayEpisode ?? episode.episodeNumber;
  const epCode = `S${String(effSeason).padStart(2, '0')}E${String(effEp).padStart(2, '0')}${
    episode.multiEpisodeEnd ? `-${String(episode.multiEpisodeEnd).padStart(2, '0')}` : ''
  }`;
  const fileCode = `S${String(episode.parsedInfo.seasonNumber ?? episode.seasonNumber).padStart(2, '0')}E${String(
    episode.parsedInfo.episodeNumber ?? episode.episodeNumber
  ).padStart(2, '0')}`;
  const hasCustomOrder =
    episode.displaySeason != null ||
    episode.displayEpisode != null ||
    (episode.parsedInfo.episodeNumber != null && episode.episodeNumber !== episode.parsedInfo.episodeNumber) ||
    (episode.parsedInfo.seasonNumber != null && episode.seasonNumber !== episode.parsedInfo.seasonNumber);

  const matchingSeason = seasons.find((s) => s.seasonNumber === effSeason) ?? seasons.find((s) => s.seasonNumber === episode.seasonNumber);
  const seasonOrShowPoster = matchingSeason?.posterPath ?? show.artwork.poster;
  const fanartUrl = getArtworkUrl(show.artwork.fanart);
  const clearlogoUrl = getArtworkUrl(show.artwork.clearlogo);
  const epActors = episode.actors.length > 0 ? episode.actors : show.actors;

  const handleSaveMetadata = async () => {
    setSaving(true);
    try {
      await api.updateEpisode(episode.id, {
        title: form.title,
        aired: form.aired || null,
        runtimeMinutes: form.runtimeMinutes ? Number(form.runtimeMinutes) : null,
        plot: form.plot,
        directors: form.directors,
        writers: form.writers,
        userRating: form.userRating ? Number(form.userRating) : null,
        writeNfo: true,
      });
      await load();
      onUpdated();
      notify('Episode metadata saved & .nfo updated');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNfo = async () => {
    setSaving(true);
    try {
      const res = await api.saveNfo('episode', episode.id, nfoXml);
      setNfoVal(res.validation);
      await load();
      onUpdated();
      notify('Episode NFO validated & written to disk');
    } catch (e) {
      notify(`Validation error: ${(e as Error).message}`);
    } finally {
      setSaving(false);
    }
  };

  const handleToggleWatched = async () => {
    const next = !episode.watched;
    await api.updateEpisode(episode.id, {
      watched: next,
      playCount: next ? Math.max(1, episode.playCount) : 0,
      writeNfo: true,
    });
    await load();
    onUpdated();
  };

  const handleQuickRename = async () => {
    const prev = await api.previewRename({ episodeIds: [episode.id] });
    const item = prev.items[0];
    if (!item?.hasChanges) {
      notify('Episode filename already matches Kodi rename pattern');
      return;
    }
    if (item.conflict) {
      notify(`Rename conflict: ${item.conflict}`);
      return;
    }
    await api.executeRename([item], true);
    await load();
    onUpdated();
    notify('Episode & sidecars renamed cleanly');
  };

  const handleSetEpisodeThumb = async (url?: string, dataBase64?: string) => {
    await api.setEpisodeArtwork(episode.id, url, dataBase64);
    setThumbUrlDraft('');
    await load();
    onUpdated();
    notify('Saved episode thumbnail');
  };

  const handleSetSeasonPoster = async (dataBase64: string) => {
    if (!matchingSeason) return;
    await api.setSeasonArtwork(matchingSeason.id, 'poster', undefined, dataBase64);
    await load();
    onUpdated();
    notify(`Updated ${matchingSeason.name} poster`);
  };

  const handleSaveActors = async (actors: ActorEntry[]) => {
    await api.updateEpisode(episode.id, { actors, writeNfo: true });
    await load();
    onUpdated();
    notify(`Saved ${actors.length} episode cast member(s) & updated NFO`);
  };

  const handleUploadActorThumb = async (actorName: string, dataBase64: string) => {
    const res = await api.uploadActorThumb({
      mediaType: 'episode',
      mediaId: episode.id,
      actorName,
      dataBase64,
    });
    notify(`Saved portrait to .actors for ${actorName}`);
    return res.thumbPath;
  };

  const handleDeleteEpisode = async (deleteFiles: boolean) => {
    await api.deleteEpisode(episode.id, deleteFiles);
    setConfirmDeleteMode(null);
    onUpdated();
    if (onDeleted) onDeleted();
    else onSelectShow(show.id, effSeason);
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Breadcrumb + Episode Hero */}
      <div className="relative border-b border-slate-800 bg-[#0e1524] shrink-0">
        {fanartUrl && (
          <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: `url("${fanartUrl}")` }} />
        )}
        <div className="relative bg-gradient-to-r from-[#0b0f17]/95 via-[#0f1522]/85 to-[#0f1522]/80">
          <div className="px-5 pt-2.5 pb-1 flex items-center gap-2 text-[11px] text-slate-400">
            <button
              onClick={() => onSelectShow(show.id, null)}
              className="text-sky-300 hover:text-sky-200 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" /> {show.title}
            </button>
            <span>/</span>
            <button
              onClick={() => onSelectShow(show.id, effSeason)}
              className="hover:text-slate-200 cursor-pointer"
            >
              Season {effSeason}
            </button>
            <span>/</span>
            <span className="font-mono text-slate-200">{epCode}</span>
            {hasCustomOrder && (
              <span className="px-1.5 py-0.2 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px]">
                File: {fileCode}
              </span>
            )}
          </div>

          <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3.5 min-w-0 flex-1">
              {tab !== 'metadata' && (
                <div className="w-24 shrink-0">
                  <PosterImage filePath={episode.thumbPath ?? show.artwork.fanart} alt={episode.title} aspect="fanart" />
                </div>
              )}
              {clearlogoUrl && (
                <img
                  src={clearlogoUrl}
                  alt={`${show.title} logo`}
                  className="hidden sm:block h-8 max-w-[130px] object-contain shrink-0 drop-shadow"
                />
              )}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="px-2 py-0.5 rounded bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-xs font-bold">
                    {epCode}
                  </span>
                  <h2 className="text-lg font-bold text-white truncate">{episode.title}</h2>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                  {episode.aired && <span>Aired: {episode.aired}</span>}
                  {episode.runtimeMinutes && <span>{episode.runtimeMinutes} min</span>}
                  <TechBadges parsed={episode.parsedInfo} streamDetails={episode.streamDetails} />
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleToggleWatched}
                className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition ${
                  episode.watched
                    ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30'
                    : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {episode.watched ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                {episode.watched ? 'Watched' : 'Unwatched'}
              </button>
              <button
                onClick={() => setSubSearchOpen(true)}
                className="px-2.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Languages className="w-3.5 h-3.5" /> Subtitles
              </button>
              <button
                onClick={handleQuickRename}
                className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FolderSync className="w-3.5 h-3.5 text-emerald-400" /> Auto-Rename
              </button>
            </div>
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="relative px-5 bg-[#0b0f17]/85 flex items-center gap-1 overflow-x-auto border-t border-slate-800/80">
          {[
            { id: 'metadata' as const, label: 'Metadata & Art', icon: <Info className="w-3.5 h-3.5" /> },
            { id: 'cast' as const, label: `Cast (${epActors.length})`, icon: <Users className="w-3.5 h-3.5" /> },
            { id: 'nfo' as const, label: 'Episode NFO XML', icon: <Code2 className="w-3.5 h-3.5" /> },
            {
              id: 'mediainfo' as const,
              label: `MediaInfo & Paths (${episode.subtitles.length} sub${episode.subtitles.length === 1 ? '' : 's'})`,
              icon: <FileCode2 className="w-3.5 h-3.5" />,
            },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`px-3 py-2 text-xs font-semibold flex items-center gap-1.5 border-b-2 transition cursor-pointer whitespace-nowrap ${
                tab === t.id ? 'border-sky-400 text-sky-300' : 'border-transparent text-slate-400 hover:text-slate-200'
              }`}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
          {toast && (
            <span className="ml-auto text-xs text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-0.5 rounded-md">
              {toast}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-5">
        {tab === 'metadata' && (
          <div className="space-y-6">
            {/* Top Row: Season/Series Poster in Top-Left + Episode Metadata Fields */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
              <div className="lg:col-span-3 xl:col-span-3">
                <div className="p-3 rounded-xl bg-slate-900/75 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">
                      {matchingSeason?.posterPath ? `Season ${effSeason} Poster` : 'Series Poster'}
                    </span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        seasonOrShowPoster ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                      }`}
                    >
                      {seasonOrShowPoster ? 'Present' : 'Missing'}
                    </span>
                  </div>
                  <PosterImage
                    filePath={seasonOrShowPoster}
                    alt={`${show.title} Season ${effSeason}`}
                    aspect="poster"
                    cacheKey={artCacheKey}
                    className="w-full shadow-xl"
                  />
                  {matchingSeason && (
                    <FileDropZone
                      accept="image/png,image/jpeg,image/webp"
                      label={`Upload Season ${effSeason} poster`}
                      compact
                      onFileLoaded={({ content }) => handleSetSeasonPoster(content)}
                    />
                  )}
                </div>
              </div>

              <div className="lg:col-span-9 xl:col-span-9 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <Field label="Episode Title" value={form.title ?? ''} onChange={(v) => setForm({ ...form, title: v })} />
                  <Field label="Aired Date (YYYY-MM-DD)" value={form.aired ?? ''} onChange={(v) => setForm({ ...form, aired: v })} />
                  <Field
                    label="Runtime (minutes)"
                    type="number"
                    value={form.runtimeMinutes != null ? String(form.runtimeMinutes) : ''}
                    onChange={(v) => setForm({ ...form, runtimeMinutes: v ? Number(v) : null })}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Episode Plot</label>
                  <textarea
                    rows={5}
                    value={form.plot ?? ''}
                    onChange={(e) => setForm({ ...form, plot: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 leading-relaxed"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <ChipInput
                    label="Directors"
                    values={form.directors ?? []}
                    onChange={(directors) => setForm({ ...form, directors })}
                    accent="emerald"
                  />
                  <ChipInput
                    label="Writers / Credits"
                    values={form.writers ?? []}
                    onChange={(writers) => setForm({ ...form, writers })}
                    accent="sky"
                  />
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
                    className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {saving ? 'Saving...' : 'Save & Write Episode NFO'}
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Section: Episode Thumb & Series Art Below Metadata Fields */}
            <div id="episode-artwork-section" className="pt-4 border-t border-slate-800/90 space-y-3">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                <ImageIcon className="w-3.5 h-3.5 text-sky-400" /> Episode &amp; Series Artwork
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                <div className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-200">Episode Still (16:9)</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                        episode.thumbPath ? 'bg-emerald-500/15 text-emerald-300' : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {episode.thumbPath ? 'Present' : 'Fallback'}
                    </span>
                  </div>
                  <PosterImage
                    filePath={episode.thumbPath ?? show.artwork.fanart}
                    alt={episode.title}
                    aspect="fanart"
                    cacheKey={artCacheKey}
                  />
                  <div className="flex gap-1.5">
                    <input
                      value={thumbUrlDraft}
                      onChange={(e) => setThumbUrlDraft(e.target.value)}
                      placeholder="URL or blank to generate"
                      className="flex-1 min-w-0 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-[11px] text-slate-200"
                    />
                    <button
                      onClick={() => handleSetEpisodeThumb(thumbUrlDraft || undefined)}
                      className="px-2 py-1 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/30 text-sky-300 text-[11px] font-semibold cursor-pointer shrink-0"
                    >
                      {thumbUrlDraft ? 'Fetch' : 'Generate'}
                    </button>
                  </div>
                  <FileDropZone
                    accept="image/png,image/jpeg,image/webp"
                    label="Drop episode thumb or browse"
                    compact
                    onFileLoaded={({ content }) => handleSetEpisodeThumb(undefined, content)}
                  />
                </div>

                {(
                  [
                    { kind: 'fanart', label: 'Series Fanart (16:9)', aspect: 'fanart' },
                    { kind: 'clearlogo', label: 'Series ClearLOGO', aspect: 'logo' },
                    { kind: 'banner', label: 'Series Banner', aspect: 'banner' },
                  ] as const
                ).map((slot) => (
                  <div key={slot.kind} className="p-3 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-200">{slot.label}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          show.artwork[slot.kind] ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {show.artwork[slot.kind] ? 'Present' : 'Missing'}
                      </span>
                    </div>
                    <PosterImage filePath={show.artwork[slot.kind]} alt={slot.label} aspect={slot.aspect} />
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {tab === 'cast' && (
          <CastListColumn
            actors={epActors}
            label={episode.actors.length > 0 ? 'Episode Cast & Guest Stars' : 'Series Cast'}
            emptyText="No cast credits found on this episode or series yet."
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
                Target file: <code className="text-sky-300">{episode.nfoPath ?? `${episode.fileName}.nfo`}</code>
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
                  <Check className="w-3.5 h-3.5" /> Save Episode NFO
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
              <div className="font-semibold text-slate-200">File &amp; Hash Details</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-slate-400">
                <div>Video File: <code className="text-slate-200 break-all">{episode.filePath}</code></div>
                <div>File Size: <span className="text-slate-200">{formatBytes(episode.fileSizeBytes)}</span></div>
                <div>OpenSubtitles Hash: <code className="text-sky-300">{episode.movieHash}</code></div>
                <div>NFO Status: <span className="text-slate-200">{episode.hasNfo ? 'Present' : 'Missing'}</span></div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="font-semibold text-slate-200">Video Streams</div>
                {episode.streamDetails.video.map((v, i) => (
                  <div key={i} className="text-slate-400 space-y-1">
                    <div>Codec: <span className="text-slate-100">{v.codec}</span></div>
                    <div>Resolution: <span className="text-slate-100">{v.width} × {v.height}</span></div>
                    <div>Duration: <span className="text-slate-100">{Math.round(v.durationSeconds / 60)} min</span></div>
                  </div>
                ))}
              </div>
              <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                <div className="font-semibold text-slate-200">Audio Streams</div>
                {episode.streamDetails.audio.map((a, i) => (
                  <div key={i} className="text-slate-400 space-y-1">
                    <div>Codec: <span className="text-slate-100">{a.codec}</span></div>
                    <div>Channels: <span className="text-slate-100">{a.channels} ch</span></div>
                    <div>Language: <span className="text-slate-100 uppercase">{a.language}</span></div>
                  </div>
                ))}
              </div>
            </div>

            {/* Sidecar Subtitles Section (File Data) */}
            <div id="episode-subtitles-section" className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                    <Subtitles className="w-3.5 h-3.5 text-sky-400" /> Sidecar Subtitle Files ({episode.subtitles.length})
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    External .srt/.ass/.vtt tracks matched beside the episode video file
                  </p>
                </div>
                <button
                  onClick={() => setSubSearchOpen(true)}
                  className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Languages className="w-3.5 h-3.5" /> Search &amp; Download
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[120px_1fr] gap-2 items-center">
                <select
                  value={uploadSubLang}
                  onChange={(e) => setUploadSubLang(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2 py-2 text-xs text-slate-200"
                >
                  <option value="en">English (en)</option>
                  <option value="es">Spanish (es)</option>
                  <option value="fr">French (fr)</option>
                  <option value="de">German (de)</option>
                  <option value="ja">Japanese (ja)</option>
                  <option value="ko">Korean (ko)</option>
                  <option value="zh">Chinese (zh)</option>
                </select>
                <FileDropZone
                  accept=".srt,.vtt,.ass,.ssa,.sub"
                  readAs="text"
                  compact
                  label="Drop local .srt / .vtt / .ass subtitle file or browse"
                  onFileLoaded={async ({ name, content }) => {
                    await api.uploadSubtitle({
                      mediaType: 'episode',
                      mediaId: episode.id,
                      fileName: name,
                      contentText: content,
                      language: uploadSubLang,
                    });
                    await load();
                    onUpdated();
                    notify(`Uploaded subtitle ${name}`);
                  }}
                />
              </div>

              {episode.subtitles.length === 0 ? (
                <div className="p-5 rounded-xl border border-dashed border-slate-700 text-center text-xs text-slate-400">
                  No subtitles attached to this episode yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {episode.subtitles.map((s) => (
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
                          Preview &amp; Sync
                        </button>
                        <button
                          onClick={async () => {
                            await api.deleteSubtitle(s.id);
                            await load();
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

            {/* Safe Library / Disk Removal */}
            <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] text-slate-400">
                Remove this episode from KodiVault library or delete video + sidecar files from disk.
              </span>
              {confirmDeleteMode ? (
                <div className="flex items-center gap-2 bg-rose-500/15 border border-rose-500/40 rounded-lg px-3 py-1.5">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0" />
                  <span className="text-[11px] text-rose-200 font-semibold">
                    {confirmDeleteMode === 'files'
                      ? 'Delete episode video, NFO, thumb & subs from disk?'
                      : 'Remove this episode from KodiVault DB?'}
                  </span>
                  <button
                    type="button"
                    onClick={() => void handleDeleteEpisode(confirmDeleteMode === 'files')}
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
        )}
      </div>

      <SubtitleSearchModal
        open={subSearchOpen}
        mediaType="episode"
        mediaId={episode.id}
        mediaTitle={`${show.title} ${epCode} — ${episode.title}`}
        onDownloaded={() => {
          void load();
          onUpdated();
        }}
        onClose={() => setSubSearchOpen(false)}
      />

      <SubtitleEditorModal
        subtitleId={editSubId}
        onUpdated={() => {
          void load();
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
    <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">{label}</label>
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-100"
    />
  </div>
);
