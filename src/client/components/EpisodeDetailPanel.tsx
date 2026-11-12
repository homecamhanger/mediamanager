import React, { useEffect, useRef, useState } from 'react';
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
  Layers,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Star,
  Subtitles,
  Trash2,
  Tv,
  Users,
} from 'lucide-react';
import type {
  ActorEntry,
  ArtworkKind,
  NfoValidationReport,
  TvEpisodeRecord,
  TvEpisodeSubEntry,
  TvSeasonRecord,
  TvShowRecord,
} from '../../shared/types.js';
import { api, formatBytes, getArtworkUrl } from '../lib/api.js';
import { detailCache, showKey, type ShowDetailPayload } from '../lib/detailCache.js';
import type { InspectorFocusTab } from '../lib/workspaceTypes.js';
import { ArtworkPickerModal, ArtworkPickerTarget, ClickableArtCard } from './ArtworkPickerModal.js';
import { CastListColumn } from './CastListColumn.js';
import { DetailHero, HeroChip, HeroTab, HeroTitle } from './DetailHero.js';
import { useLibraryVocabulary } from '../lib/useLibraryVocabulary.js';
import { ChipInput } from './ChipInput.js';
import { EpisodeScrapeModal } from './EpisodeScrapeModal.js';
import { FileDropZone } from './FileDropZone.js';
import { FormField as Field } from './FormField.js';
import { PosterImage } from './PosterImage.js';
import { TechBadges } from './QualityBadges.js';
import { SubtitleEditorModal, SubtitleSearchModal } from './SubtitleSearchModal.js';

type EpisodeTab = 'metadata' | 'cast' | 'nfo' | 'mediainfo';

/**
 * Episodes all read one `GET /api/shows/:id` payload, so this window is what stops
 * clicking through a season from firing a series fetch per episode. Edits clear the
 * cache via `refreshAll`, so metadata cannot go stale behind this.
 */
const EPISODE_PAYLOAD_MAX_AGE_MS = 30_000;

function resolveEpisodeTab(tab?: EpisodeTab | InspectorFocusTab): EpisodeTab {
  if (tab === 'subtitles' || tab === 'mediainfo') return 'mediainfo';
  if (tab === 'nfo') return 'nfo';
  if (tab === 'cast') return 'cast';
  return 'metadata';
}

export const EpisodeDetailPanel: React.FC<{
  showId: number;
  episodeId: number;
  /**
   * What the list already knows about this episode. Painted immediately so clicking
   * an episode shows *that* episode, not the one selected before it.
   */
  seed?: { show: TvShowRecord; episode: TvEpisodeRecord } | null;
  initialTab?: EpisodeTab | InspectorFocusTab;
  activeActor?: string | null;
  onSelectActor?: (actorName: string) => void;
  onSelectShow: (showId: number, seasonNumber?: number | null) => void;
  onUpdated: () => void;
  onDeleted?: () => void;
}> = ({ showId, episodeId, seed, initialTab, activeActor, onSelectActor, onSelectShow, onUpdated, onDeleted }) => {
  const [show, setShow] = useState<TvShowRecord | null>(seed?.show ?? null);
  const [seasons, setSeasons] = useState<TvSeasonRecord[]>([]);
  const [episode, setEpisode] = useState<TvEpisodeRecord | null>(seed?.episode ?? null);
  const [refreshing, setRefreshing] = useState(false);
  const mountedRef = useRef(true);
  /** Monotonic per-load token; stale responses are dropped. See MovieDetailPanel. */
  const loadTokenRef = useRef(0);
  const [form, setForm] = useState<Partial<TvEpisodeRecord>>({});
  const [partsDraft, setPartsDraft] = useState<TvEpisodeSubEntry[]>([]);
  const [activePartIdx, setActivePartIdx] = useState(0);
  const [tab, setTab] = useState<EpisodeTab>(resolveEpisodeTab(initialTab));
  const [nfoXml, setNfoXml] = useState('');
  const [nfoVal, setNfoVal] = useState<NfoValidationReport | null>(null);
  const [subSearchOpen, setSubSearchOpen] = useState(false);
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [artPickerTarget, setArtPickerTarget] = useState<ArtworkPickerTarget | null>(null);
  const [artCacheKey, setArtCacheKey] = useState(0);
  const [uploadSubLang, setUploadSubLang] = useState('en');
  const [confirmDeleteMode, setConfirmDeleteMode] = useState<'db' | 'files' | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const vocabulary = useLibraryVocabulary();

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  /** Applies a show payload to the panel; returns the selected episode, if present. */
  const applyPayload = (payload: ShowDetailPayload, applyOpts: { keepArtCacheKey?: boolean } = {}) => {
    setShow(payload.show);
    setSeasons(payload.seasons);
    const ep = payload.episodes.find((e) => e.id === episodeId) ?? null;
    setEpisode(ep);
    if (!applyOpts.keepArtCacheKey) setArtCacheKey((k) => k + 1);
    if (ep) {
      setForm(ep);
      setPartsDraft(ep.multiEpisodeParts ?? []);
      setActivePartIdx((prev) => (prev > (ep.multiEpisodeParts?.length ?? 0) ? 0 : prev));
    }
    return ep;
  };

  /**
   * Paints from cache/seed first, then revalidates.
   *
   * Episodes share the show payload — one `GET /api/shows/:id` carries the whole
   * series and its episodes — so the cache key is the show, and the panel picks its
   * episode out of the result. `episodeId` is part of the token, not the key, so
   * moving between episodes of one show reuses the payload it already has.
   */
  const load = async ({ force = false }: { force?: boolean } = {}) => {
    const token = ++loadTokenRef.current;
    const isCurrent = () => mountedRef.current && token === loadTokenRef.current;

    if (!force) {
      const cached = detailCache.peek<ShowDetailPayload>(showKey(showId));
      if (cached) applyPayload(cached);
    }

    setRefreshing(true);
    try {
      const payload = await detailCache.refresh<ShowDetailPayload>(
        showKey(showId),
        async () => {
          const res = await api.getShow(showId);
          return {
            show: res.show,
            seasons: res.seasons,
            episodes: res.episodes,
            missingEpisodes: res.missingEpisodes ?? [],
            unmatchedFiles: res.unmatchedFiles ?? [],
          };
        },
        // Every episode of a show shares one payload; within this window, stepping
        // between episodes reads the cache instead of refetching the whole series.
        { maxAgeMs: force ? 0 : EPISODE_PAYLOAD_MAX_AGE_MS },
      );
      if (!isCurrent()) return;
      const ep = applyPayload(payload);
      setConfirmDeleteMode(null);
      // Paint the episode now; its NFO arrives behind it.
      setRefreshing(false);

      if (ep) {
        const nfo = await api.readNfo('episode', ep.id);
        if (!isCurrent()) return;
        setNfoXml(nfo.xml);
        setNfoVal(nfo.validation);
      }
    } catch {
      // Keep whatever is painted; a failed refresh must not blank the panel.
    } finally {
      if (isCurrent()) setRefreshing(false);
    }
  };

  useEffect(() => {
    setTab(resolveEpisodeTab(initialTab));
    // Reset per-item state: the newly selected episode must never inherit the
    // previous one's title, NFO or parts list while its record loads.
    setEpisode(seed?.episode ?? null);
    setShow(seed?.show ?? null);
    setForm(seed?.episode ?? {});
    setPartsDraft(seed?.episode?.multiEpisodeParts ?? []);
    setActivePartIdx(0);
    setNfoXml('');
    setNfoVal(null);
    setConfirmDeleteMode(null);
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
    return (
      <div className="space-y-3 p-6">
        <div className="h-5 w-2/5 animate-pulse rounded bg-slate-700/60" />
        <div className="h-3 w-1/3 animate-pulse rounded bg-slate-700/40" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-slate-800/50" />
      </div>
    );
  }

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const effSeason = episode.displaySeason ?? episode.seasonNumber;
  const effEp = episode.displayEpisode ?? episode.episodeNumber;
  const epCode = `S${String(effSeason).padStart(2, '0')}E${String(effEp).padStart(2, '0')}${
    episode.multiEpisodeEnd ? `-E${String(episode.multiEpisodeEnd).padStart(2, '0')}` : ''
  }`;
  const totalPartCount = Math.max(
    1 + partsDraft.length,
    episode.multiEpisodeEnd && episode.multiEpisodeEnd > episode.episodeNumber
      ? episode.multiEpisodeEnd - episode.episodeNumber + 1
      : 1
  );
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

  const syncMultiRangeParts = (nextSeason: number, nextStartEp: number, nextMultiEnd: number | null) => {
    setForm((prev) => ({
      ...prev,
      seasonNumber: nextSeason,
      episodeNumber: nextStartEp,
      multiEpisodeEnd: nextMultiEnd,
    }));
    setPartsDraft((prev) => {
      if (!nextMultiEnd || nextMultiEnd <= nextStartEp) {
        return prev.filter((p) => p.seasonNumber !== nextSeason || p.episodeNumber <= nextStartEp);
      }
      const byKey = new Map(prev.map((p) => [`${p.seasonNumber}:${p.episodeNumber}`, p]));
      const rebuilt: TvEpisodeSubEntry[] = [];
      for (let num = nextStartEp + 1; num <= nextMultiEnd; num++) {
        rebuilt.push(
          byKey.get(`${nextSeason}:${num}`) ?? {
            seasonNumber: nextSeason,
            episodeNumber: num,
            displaySeason: null,
            displayEpisode: null,
            title: `Episode ${num}`,
            aired: null,
            plot: '',
            runtimeMinutes: episode.runtimeMinutes,
            directors: [],
            writers: [],
            actors: [],
            uniqueIds: {},
            ratings: [],
            userRating: null,
            playCount: 0,
            watched: false,
            lastPlayed: null,
          }
        );
      }
      for (const extra of prev) {
        if (
          extra.seasonNumber !== nextSeason ||
          extra.episodeNumber <= nextStartEp ||
          extra.episodeNumber > nextMultiEnd
        ) {
          rebuilt.push(extra);
        }
      }
      return rebuilt;
    });
  };

  const handleAddNextPart = () => {
    const sNum = form.seasonNumber ?? episode.seasonNumber;
    const startEp = form.episodeNumber ?? episode.episodeNumber;
    const currentMax = Math.max(
      startEp,
      form.multiEpisodeEnd ?? startEp,
      ...partsDraft.filter((p) => p.seasonNumber === sNum).map((p) => p.episodeNumber)
    );
    const nextEnd = currentMax + 1;
    syncMultiRangeParts(sNum, startEp, nextEnd);
    setActivePartIdx(partsDraft.length + 1);
  };

  const handleRemoveSubPart = (subIndex: number) => {
    const target = partsDraft[subIndex];
    const nextParts = partsDraft.filter((_, i) => i !== subIndex);
    setPartsDraft(nextParts);
    const sNum = form.seasonNumber ?? episode.seasonNumber;
    const startEp = form.episodeNumber ?? episode.episodeNumber;
    const maxSameSeason = nextParts
      .filter((p) => p.seasonNumber === sNum)
      .reduce((max, p) => Math.max(max, p.episodeNumber), startEp);
    setForm((prev) => ({
      ...prev,
      multiEpisodeEnd: maxSameSeason > startEp ? maxSameSeason : null,
    }));
    if (activePartIdx === subIndex + 1) setActivePartIdx(0);
    else if (activePartIdx > subIndex + 1) setActivePartIdx((i) => Math.max(0, i - 1));
    if (target) notify(`Removed Part S${String(target.seasonNumber).padStart(2, '0')}E${String(target.episodeNumber).padStart(2, '0')} (click Save to write NFO)`);
  };

  const updateActiveSubPart = <K extends keyof TvEpisodeSubEntry>(key: K, value: TvEpisodeSubEntry[K]) => {
    const subIdx = activePartIdx - 1;
    if (subIdx < 0) return;
    setPartsDraft((prev) => prev.map((p, i) => (i === subIdx ? { ...p, [key]: value } : p)));
  };

  const handleSaveMetadata = async () => {
    setSaving(true);
    try {
      const sNum = form.seasonNumber ?? episode.seasonNumber;
      const eNum = form.episodeNumber ?? episode.episodeNumber;
      const endNum =
        form.multiEpisodeEnd != null && form.multiEpisodeEnd > eNum ? Number(form.multiEpisodeEnd) : null;
      await api.updateEpisode(episode.id, {
        seasonNumber: sNum,
        episodeNumber: eNum,
        multiEpisodeEnd: endNum,
        multiEpisodeParts: partsDraft,
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
      notify(
        partsDraft.length > 0
          ? `Saved ${1 + partsDraft.length}-part multi-episode & wrote NFO`
          : 'Episode metadata saved & .nfo updated'
      );
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

  const handleRefreshInKodi = async () => {
    const res = await api.refreshKodiItem('episode', episode.id);
    notify(res.ok ? `Refreshed "${episode.title}" in Kodi` : `Kodi refresh: ${res.error}`);
  };

  const handleSetEpisodeThumb = async (url?: string, dataBase64?: string) => {
    await api.setEpisodeArtwork(episode.id, url, dataBase64);
    await load();
    onUpdated();
    notify('Saved episode thumbnail');
  };

  const handleSetSeasonPoster = async (url?: string, dataBase64?: string) => {
    if (!matchingSeason) return;
    await api.setSeasonArtwork(matchingSeason.id, 'poster', url, dataBase64);
    await load();
    onUpdated();
    notify(`Updated ${matchingSeason.name} poster`);
  };

  const handleSetShowArtwork = async (kind: ArtworkKind, url?: string, dataBase64?: string) => {
    await api.setShowArtwork(show.id, kind, url, dataBase64);
    await load();
    onUpdated();
    notify(`Updated series ${kind} artwork`);
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
      <DetailHero
        fanartUrl={fanartUrl}
        breadcrumb={
          <>
            <button
              onClick={() => onSelectShow(show.id, null)}
              className="text-sky-300 hover:text-sky-200 font-semibold flex items-center gap-1 cursor-pointer"
            >
              <ArrowLeft className="w-3 h-3" /> {show.title}
            </button>
            <span>/</span>
            <button onClick={() => onSelectShow(show.id, effSeason)} className="hover:text-slate-200 cursor-pointer">
              Season {effSeason}
            </button>
            <span>/</span>
            <span className="font-mono text-slate-200">{epCode}</span>
            {hasCustomOrder && (
              <span className="px-1.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono text-[10px]">
                File: {fileCode}
              </span>
            )}
          </>
        }
        leading={
          <>
            {tab !== 'metadata' && (
              <div className="w-20 shrink-0">
                <PosterImage filePath={episode.thumbPath ?? show.artwork.fanart} alt={episode.title} aspect="fanart" compact />
              </div>
            )}
            {clearlogoUrl && (
              <img
                src={clearlogoUrl}
                alt={`${show.title} logo`}
                className="hidden @lg:block h-8 max-w-[120px] object-contain shrink-0 drop-shadow"
              />
            )}
          </>
        }
        titleArea={
          <HeroTitle>
            {refreshing && (
              <span className="mr-2 inline-flex items-center gap-1 align-middle text-[10px] font-semibold text-sky-300/90">
                <Loader2 className="w-3 h-3 animate-spin" />
                Updating…
              </span>
            )}
            <span className="mr-1.5 font-mono text-sky-300">{epCode}</span>
            {episode.title}
            {totalPartCount > 1 && (
              <HeroChip tone="indigo">
                <Layers className="w-3 h-3 inline -mt-px mr-1" />
                {totalPartCount}-Part Multi-Episode
              </HeroChip>
            )}
          </HeroTitle>
        }
        meta={
          <>
            {episode.aired && <span className="whitespace-nowrap">Aired: {episode.aired}</span>}
            {episode.runtimeMinutes && <span className="whitespace-nowrap">{episode.runtimeMinutes} min</span>}
            <TechBadges parsed={episode.parsedInfo} streamDetails={episode.streamDetails} />
          </>
        }
        actions={
          <>
            <button
              onClick={() => setScrapeOpen(true)}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Scrape Episode
            </button>
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
            <button
              onClick={handleRefreshInKodi}
              title="Reload this episode's NFO & artwork in Kodi via JSON-RPC"
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Tv className="w-3.5 h-3.5 text-sky-400" /> Kodi Refresh
            </button>
          </>
        }
        tabs={[
          { id: 'metadata' as const, label: 'Metadata & Art', icon: <Info className="w-3.5 h-3.5" /> },
          { id: 'cast' as const, label: `Cast (${epActors.length})`, icon: <Users className="w-3.5 h-3.5" /> },
          { id: 'nfo' as const, label: 'Episode NFO XML', icon: <Code2 className="w-3.5 h-3.5" /> },
          {
            id: 'mediainfo' as const,
            label: `MediaInfo & Paths (${episode.subtitles.length} sub${episode.subtitles.length === 1 ? '' : 's'})`,
            icon: <FileCode2 className="w-3.5 h-3.5" />,
          },
        ].map((t) => (
          <HeroTab key={t.id} active={tab === t.id} icon={t.icon} label={t.label} onClick={() => setTab(t.id)} />
        ))}
        toast={toast}
      />

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-4 @xl:p-5 @container">
        {tab === 'metadata' && (
          <div className="space-y-6">
            {/* Top Row: Season/Series Poster in Top-Left + Episode Metadata Fields */}
            <div className="flex flex-wrap items-start gap-3 @md:gap-5">
              <div className="w-24 @md:w-32 @3xl:w-40 shrink-0 @md:sticky @md:top-0">
                <ClickableArtCard
                  label={matchingSeason?.posterPath ? `Season ${effSeason} Poster` : 'Series Poster'}
                  filePath={seasonOrShowPoster}
                  aspect="poster"
                  cacheKey={artCacheKey}
                  onClick={() =>
                    setArtPickerTarget(
                      matchingSeason
                        ? {
                            mediaType: 'season',
                            mediaId: matchingSeason.id,
                            mediaTitle: `${show.title} · ${matchingSeason.name}`,
                            kind: 'poster',
                            label: `${matchingSeason.name} Poster`,
                            aspect: 'poster',
                            currentPath: seasonOrShowPoster,
                          }
                        : {
                            mediaType: 'tvshow',
                            mediaId: show.id,
                            mediaTitle: show.title,
                            kind: 'poster',
                            label: 'Series Poster (2:3)',
                            aspect: 'poster',
                            currentPath: show.artwork.poster,
                            initialCandidates: show.artworkCandidates?.poster,
                          }
                    )
                  }
                />
              </div>

              <div className="min-w-[15rem] flex-1 basis-60 space-y-3 @container">
                {/* Multi-Episode Range & Part Switcher */}
                <div className="p-3 rounded-xl bg-slate-900/75 border border-slate-800 space-y-2.5">
                  <div className="flex flex-wrap items-end justify-between gap-2">
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                          Season
                        </label>
                        <input
                          type="number"
                          min={0}
                          value={form.seasonNumber ?? episode.seasonNumber}
                          onChange={(e) =>
                            syncMultiRangeParts(
                              Math.max(0, Number(e.target.value || 0)),
                              form.episodeNumber ?? episode.episodeNumber,
                              form.multiEpisodeEnd ?? null
                            )
                          }
                          className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-100 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                          Start Ep
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={form.episodeNumber ?? episode.episodeNumber}
                          onChange={(e) =>
                            syncMultiRangeParts(
                              form.seasonNumber ?? episode.seasonNumber,
                              Math.max(1, Number(e.target.value || 1)),
                              form.multiEpisodeEnd ?? null
                            )
                          }
                          className="w-16 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-100 font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-0.5">
                          End Ep (Multi-Part)
                        </label>
                        <input
                          type="number"
                          min={(form.episodeNumber ?? episode.episodeNumber) + 1}
                          placeholder="Single"
                          value={form.multiEpisodeEnd ?? ''}
                          onChange={(e) => {
                            const sNum = form.seasonNumber ?? episode.seasonNumber;
                            const eNum = form.episodeNumber ?? episode.episodeNumber;
                            const val = e.target.value.trim() ? Number(e.target.value) : null;
                            syncMultiRangeParts(sNum, eNum, val && val > eNum ? val : null);
                          }}
                          className="w-24 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-xs text-slate-100 font-mono"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleAddNextPart}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-indigo-300 flex items-center gap-1 cursor-pointer"
                      >
                        <Plus className="w-3 h-3" /> Add Part
                      </button>
                    </div>
                    <span className="text-[11px] text-slate-400">
                      {partsDraft.length > 0
                        ? `Editing Part ${activePartIdx + 1} of ${1 + partsDraft.length} (<episodedetails> blocks)`
                        : 'Single-episode NFO'}
                    </span>
                  </div>

                  {partsDraft.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800/80">
                      <button
                        type="button"
                        onClick={() => setActivePartIdx(0)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition ${
                          activePartIdx === 0
                            ? 'bg-sky-500/20 border-sky-400 text-sky-200'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        Part 1 · S{String(form.seasonNumber ?? episode.seasonNumber).padStart(2, '0')}E
                        {String(form.episodeNumber ?? episode.episodeNumber).padStart(2, '0')}: {(form.title ?? '').slice(0, 22) || 'Untitled'}
                      </button>
                      {partsDraft.map((sub, sIdx) => (
                        <button
                          key={`${sub.seasonNumber}-${sub.episodeNumber}-${sIdx}`}
                          type="button"
                          onClick={() => setActivePartIdx(sIdx + 1)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer transition ${
                            activePartIdx === sIdx + 1
                              ? 'bg-indigo-500/20 border-indigo-400 text-indigo-200'
                              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          Part {sIdx + 2} · S{String(sub.seasonNumber).padStart(2, '0')}E
                          {String(sub.episodeNumber).padStart(2, '0')}: {(sub.title || '').slice(0, 22) || 'Untitled'}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {activePartIdx === 0 || !partsDraft[activePartIdx - 1] ? (
                  <>
                    <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-2.5">
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

                    <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3">
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
                        accent="sky"
                      />
                    </div>
                  </>
                ) : (() => {
                  const activeSub = partsDraft[activePartIdx - 1];
                  return (
                    <div className="p-3.5 rounded-xl bg-indigo-500/5 border border-indigo-500/30 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-bold text-indigo-300">
                          Editing Multi-Episode Part {activePartIdx + 1} (S{String(activeSub.seasonNumber).padStart(2, '0')}E
                          {String(activeSub.episodeNumber).padStart(2, '0')})
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSubPart(activePartIdx - 1)}
                          className="px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-[11px] font-semibold text-rose-300 cursor-pointer"
                        >
                          Remove Part
                        </button>
                      </div>
                      <div className="grid grid-cols-2 @3xl:grid-cols-5 gap-2.5">
                        <Field
                          label="Part Season"
                          type="number"
                          value={String(activeSub.seasonNumber)}
                          onChange={(v) => updateActiveSubPart('seasonNumber', Math.max(0, Number(v || 0)))}
                        />
                        <Field
                          label="Part Episode #"
                          type="number"
                          value={String(activeSub.episodeNumber)}
                          onChange={(v) => updateActiveSubPart('episodeNumber', Math.max(1, Number(v || 1)))}
                        />
                        <div className="@lg:col-span-2 @3xl:col-span-3">
                          <Field
                            label="Part Title"
                            value={activeSub.title ?? ''}
                            onChange={(v) => updateActiveSubPart('title', v)}
                          />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 @lg:grid-cols-2 gap-2.5">
                        <Field
                          label="Aired Date (YYYY-MM-DD)"
                          value={activeSub.aired ?? ''}
                          onChange={(v) => updateActiveSubPart('aired', v || null)}
                        />
                        <Field
                          label="Runtime (minutes)"
                          type="number"
                          value={activeSub.runtimeMinutes != null ? String(activeSub.runtimeMinutes) : ''}
                          onChange={(v) => updateActiveSubPart('runtimeMinutes', v ? Number(v) : null)}
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                          Part Plot
                        </label>
                        <textarea
                          rows={4}
                          value={activeSub.plot ?? ''}
                          onChange={(e) => updateActiveSubPart('plot', e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 leading-relaxed"
                        />
                      </div>
                      <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3">
                        <ChipInput
                          label="Directors"
                          values={activeSub.directors ?? []}
                          onChange={(directors) => updateActiveSubPart('directors', directors)}
                          vocabulary={vocabulary?.directors}
                          hideQuickAdd
                          accent="emerald"
                        />
                        <ChipInput
                          label="Writers / Credits"
                          values={activeSub.writers ?? []}
                          onChange={(writers) => updateActiveSubPart('writers', writers)}
                          vocabulary={vocabulary?.writers}
                          hideQuickAdd
                          accent="sky"
                        />
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between pt-2 border-t border-slate-800">
                  <div className="flex items-center gap-1.5">
                    <Star className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs text-slate-400">
                      {activePartIdx === 0 ? 'User Rating:' : `Part ${activePartIdx + 1} Rating:`}
                    </span>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={
                        activePartIdx === 0
                          ? (form.userRating ?? '')
                          : (partsDraft[activePartIdx - 1]?.userRating ?? '')
                      }
                      onChange={(e) => {
                        const val = e.target.value ? Number(e.target.value) : null;
                        if (activePartIdx === 0) setForm({ ...form, userRating: val });
                        else updateActiveSubPart('userRating', val);
                      }}
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
              <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4 gap-3.5">
                <ClickableArtCard
                  label="Episode Still (16:9)"
                  filePath={episode.thumbPath ?? show.artwork.fanart}
                  aspect="fanart"
                  cacheKey={artCacheKey}
                  statusLabel={episode.thumbPath ? 'Present' : 'Fallback'}
                  onClick={() =>
                    setArtPickerTarget({
                      mediaType: 'episode',
                      mediaId: episode.id,
                      mediaTitle: `${show.title} ${epCode} — ${episode.title}`,
                      kind: 'thumb',
                      label: 'Episode Still (16:9)',
                      aspect: 'fanart',
                      currentPath: episode.thumbPath ?? show.artwork.fanart,
                    })
                  }
                />

                {(
                  [
                    { kind: 'fanart', label: 'Series Fanart (16:9)', aspect: 'fanart' },
                    { kind: 'clearlogo', label: 'Series ClearLOGO', aspect: 'logo' },
                    { kind: 'banner', label: 'Series Banner', aspect: 'banner' },
                  ] as const
                ).map((slot) => (
                  <ClickableArtCard
                    key={slot.kind}
                    label={slot.label}
                    filePath={show.artwork[slot.kind]}
                    aspect={slot.aspect}
                    cacheKey={artCacheKey}
                    onClick={() =>
                      setArtPickerTarget({
                        mediaType: 'tvshow',
                        mediaId: show.id,
                        mediaTitle: show.title,
                        kind: slot.kind,
                        label: slot.label,
                        aspect: slot.aspect,
                        currentPath: show.artwork[slot.kind],
                        initialCandidates: show.artworkCandidates?.[slot.kind],
                      })
                    }
                  />
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
              <div className="text-xs text-slate-400 flex flex-wrap items-center gap-2">
                <span>
                  Target file: <code className="text-sky-300">{episode.nfoPath ?? `${episode.fileName}.nfo`}</code>
                </span>
                {totalPartCount > 1 && (
                  <span className="px-2 py-0.5 rounded bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 text-[10px] font-semibold">
                    {totalPartCount} &lt;episodedetails&gt; blocks
                  </span>
                )}
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

              <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-2 items-center">
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

      <ArtworkPickerModal
        target={artPickerTarget}
        cacheKey={artCacheKey}
        onApply={({ url, dataBase64 }) => {
          if (!artPickerTarget) return;
          if (artPickerTarget.mediaType === 'episode') {
            return handleSetEpisodeThumb(url, dataBase64);
          }
          if (artPickerTarget.mediaType === 'season') {
            return handleSetSeasonPoster(url, dataBase64);
          }
          return handleSetShowArtwork(artPickerTarget.kind, url, dataBase64);
        }}
        onClose={() => setArtPickerTarget(null)}
      />

      <EpisodeScrapeModal
        open={scrapeOpen}
        show={show}
        episode={episode}
        onClose={() => setScrapeOpen(false)}
        onApplied={() => {
          void load();
          onUpdated();
          notify('Episode metadata & NFO scraped cleanly');
        }}
      />
    </div>
  );
};
