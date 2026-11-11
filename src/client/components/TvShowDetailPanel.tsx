import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  Check,
  Code2,
  Eye,
  EyeOff,
  FileCode2,
  FolderSync,
  GripVertical,
  Image as ImageIcon,
  Info,
  Languages,
  RotateCcw,
  Save,
  Sparkles,
  Tv,
  Users,
} from 'lucide-react';
import type {
  ActorEntry,
  ArtworkKind,
  MissingEpisodeRecord,
  NfoValidationReport,
  TvEpisodeRecord,
  TvSeasonRecord,
  TvShowRecord,
} from '../../shared/types.js';
import { api, getArtworkUrl } from '../lib/api.js';
import type { InspectorFocusTab } from '../lib/workspaceTypes.js';
import { ArtworkPickerModal, ArtworkPickerTarget, ClickableArtCard } from './ArtworkPickerModal.js';
import { CastListColumn } from './CastListColumn.js';
import { DetailHero, HeroChip, HeroTab, HeroTitle } from './DetailHero.js';
import { ChipInput } from './ChipInput.js';
import { EpisodeScrapeModal } from './EpisodeScrapeModal.js';
import { FormField as Field } from './FormField.js';
import { PosterImage } from './PosterImage.js';
import { TechBadges } from './QualityBadges.js';
import { RatingBadges } from './RatingBadges.js';
import { ScrapeModal } from './ScrapeModal.js';
import { SubtitleSearchModal } from './SubtitleSearchModal.js';

type TvTab = 'episodes' | 'order' | 'metadata' | 'cast' | 'nfo';

const SHOW_OTHER_ARTWORK_SLOTS: Array<{ kind: ArtworkKind; label: string; aspect: 'poster' | 'fanart' | 'banner' | 'square' | 'logo' }> = [
  { kind: 'fanart', label: 'Fanart Backdrop (16:9)', aspect: 'fanart' },
  { kind: 'banner', label: 'Wide Banner', aspect: 'banner' },
  { kind: 'clearlogo', label: 'HD ClearLOGO (PNG)', aspect: 'logo' },
  { kind: 'clearart', label: 'HD ClearART (PNG)', aspect: 'fanart' },
  { kind: 'landscape', label: 'Landscape Thumb (16:9)', aspect: 'fanart' },
];

function resolveTvTab(tab?: TvTab | InspectorFocusTab): TvTab {
  if (tab === 'artwork' || tab === 'metadata') return 'metadata';
  if (tab === 'cast') return 'cast';
  if (tab === 'nfo') return 'nfo';
  if (tab === 'order') return 'order';
  return 'episodes';
}

function sortEpisodesEffective(eps: TvEpisodeRecord[]): TvEpisodeRecord[] {
  return [...eps].sort((a, b) => {
    const as = a.displaySeason ?? a.seasonNumber;
    const bs = b.displaySeason ?? b.seasonNumber;
    if (as !== bs) return as - bs;
    const ae = a.displayEpisode ?? a.episodeNumber;
    const be = b.displayEpisode ?? b.episodeNumber;
    if (ae !== be) return ae - be;
    if (a.seasonNumber !== b.seasonNumber) return a.seasonNumber - b.seasonNumber;
    return a.episodeNumber - b.episodeNumber;
  });
}

export const TvShowDetailPanel: React.FC<{
  showId: number;
  selectedSeason?: number | null;
  initialTab?: TvTab | InspectorFocusTab;
  activeActor?: string | null;
  onSelectActor?: (actorName: string) => void;
  onSelectSeason?: (seasonNumber: number | null) => void;
  onSelectEpisode?: (episodeId: number) => void;
  onUpdated: () => void;
  onClose?: () => void;
}> = ({ showId, selectedSeason = null, initialTab, activeActor, onSelectActor, onSelectSeason, onSelectEpisode, onUpdated, onClose }) => {
  const [show, setShow] = useState<TvShowRecord | null>(null);
  const [seasons, setSeasons] = useState<TvSeasonRecord[]>([]);
  const [episodes, setEpisodes] = useState<TvEpisodeRecord[]>([]);
  const [missingEpisodes, setMissingEpisodes] = useState<MissingEpisodeRecord[]>([]);
  const [showMissingOnly, setShowMissingOnly] = useState(false);
  const [activeSeason, setActiveSeason] = useState<number | 'all'>(selectedSeason ?? 'all');
  const [tab, setTab] = useState<TvTab>(resolveTvTab(initialTab));
  const [form, setForm] = useState<Partial<TvShowRecord>>({});
  const [nfoXml, setNfoXml] = useState('');
  const [nfoVal, setNfoVal] = useState<NfoValidationReport | null>(null);
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [scrapeTargetEp, setScrapeTargetEp] = useState<TvEpisodeRecord | null>(null);
  const [subTargetEp, setSubTargetEp] = useState<TvEpisodeRecord | null>(null);
  const [artCacheKey, setArtCacheKey] = useState(0);
  const [artPickerTarget, setArtPickerTarget] = useState<ArtworkPickerTarget | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Season-level episode order state
  const [orderDraft, setOrderDraft] = useState<TvEpisodeRecord[]>([]);
  const [orderMode, setOrderMode] = useState<'display' | 'canonical'>('display');
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);

  const load = async () => {
    const res = await api.getShow(showId);
    setShow(res.show);
    setForm(res.show);
    setSeasons(res.seasons);
    setEpisodes(res.episodes);
    setMissingEpisodes(res.missingEpisodes ?? []);
    setArtCacheKey((k) => k + 1);
    const nfo = await api.readNfo('tvshow', showId);
    setNfoXml(nfo.xml);
    setNfoVal(nfo.validation);
  };

  useEffect(() => {
    setTab(resolveTvTab(initialTab));
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId, initialTab]);

  useEffect(() => {
    if (initialTab === 'artwork') {
      const id = setTimeout(() => {
        document.getElementById('show-artwork-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 80);
      return () => clearTimeout(id);
    }
  }, [initialTab, showId]);

  useEffect(() => {
    setActiveSeason(selectedSeason ?? 'all');
  }, [selectedSeason, showId]);

  useEffect(() => {
    if (activeSeason === 'all' && tab === 'order') {
      setTab('episodes');
    }
  }, [activeSeason, tab]);

  const visibleEpisodes = useMemo(() => {
    const filtered =
      activeSeason === 'all'
        ? episodes
        : episodes.filter((e) => (e.displaySeason ?? e.seasonNumber) === activeSeason);
    return sortEpisodesEffective(filtered);
  }, [episodes, activeSeason]);

  const visibleMissing = useMemo(() => {
    return activeSeason === 'all'
      ? missingEpisodes
      : missingEpisodes.filter((m) => m.seasonNumber === activeSeason);
  }, [missingEpisodes, activeSeason]);

  useEffect(() => {
    if (activeSeason !== 'all') {
      setOrderDraft(visibleEpisodes);
      setOrderDirty(false);
    }
  }, [activeSeason, visibleEpisodes]);

  if (!show) {
    return <div className="p-6 text-xs text-slate-400">Loading TV series...</div>;
  }

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const hasCustomSeasonOrder =
    activeSeason !== 'all' &&
    visibleEpisodes.some(
      (e) =>
        e.displaySeason != null ||
        e.displayEpisode != null ||
        (e.parsedInfo.episodeNumber != null && e.episodeNumber !== e.parsedInfo.episodeNumber) ||
        (e.parsedInfo.seasonNumber != null && e.seasonNumber !== e.parsedInfo.seasonNumber)
    );

  const moveOrderItem = (fromIdx: number, toIdx: number) => {
    if (toIdx < 0 || toIdx >= orderDraft.length || fromIdx === toIdx) return;
    setOrderDraft((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIdx, 1);
      next.splice(toIdx, 0, moved);
      return next;
    });
    setOrderDirty(true);
  };

  const handleSortOrderByAired = () => {
    setOrderDraft((prev) =>
      [...prev].sort((a, b) => {
        if (a.aired && b.aired && a.aired !== b.aired) return a.aired.localeCompare(b.aired);
        if (a.aired && !b.aired) return -1;
        if (!a.aired && b.aired) return 1;
        return a.episodeNumber - b.episodeNumber;
      })
    );
    setOrderDirty(true);
  };

  const handleApplyOrder = async () => {
    if (activeSeason === 'all' || orderDraft.length === 0) return;
    setBusy(true);
    try {
      const items = orderDraft.map((ep, idx) => ({
        episodeId: ep.id,
        targetSeason: activeSeason,
        targetEpisode: idx + 1,
      }));
      const res = await api.updateEpisodeOrder(show.id, { mode: orderMode, items });
      setShow(res.show);
      setSeasons(res.seasons);
      setEpisodes(res.episodes);
      setOrderDirty(false);
      onUpdated();
      notify(`Saved custom ${orderMode === 'display' ? 'display' : 'episode'} order to ${res.updatedCount} NFO file(s)`);
    } finally {
      setBusy(false);
    }
  };

  const handleResetOrder = async () => {
    if (activeSeason === 'all' || visibleEpisodes.length === 0) return;
    setBusy(true);
    try {
      const items = visibleEpisodes.map((ep) => ({
        episodeId: ep.id,
        targetSeason: ep.parsedInfo.seasonNumber ?? ep.seasonNumber,
        targetEpisode: ep.parsedInfo.episodeNumber ?? ep.episodeNumber,
      }));
      const res = await api.updateEpisodeOrder(show.id, { mode: 'reset', items });
      setShow(res.show);
      setSeasons(res.seasons);
      setEpisodes(res.episodes);
      setOrderDirty(false);
      onUpdated();
      notify(`Reset Season ${activeSeason} NFOs to filename order`);
    } finally {
      setBusy(false);
    }
  };

  const toggleEpisodeWatched = async (ep: TvEpisodeRecord, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.updateEpisode(ep.id, {
      watched: !ep.watched,
      playCount: !ep.watched ? 1 : 0,
      writeNfo: true,
    });
    await load();
    onUpdated();
  };

  const handleSaveMetadata = async () => {
    setBusy(true);
    try {
      await api.updateShow(show.id, {
        title: form.title,
        originalTitle: form.originalTitle,
        sortTitle: form.sortTitle,
        year: form.year ? Number(form.year) : null,
        premiered: form.premiered || null,
        status: form.status,
        mpaa: form.mpaa,
        studio: form.studio,
        plot: form.plot,
        genres: form.genres,
        tags: form.tags,
        uniqueIds: form.uniqueIds,
        userRating: form.userRating ? Number(form.userRating) : null,
        writeNfo: true,
      });
      await load();
      onUpdated();
      notify('Show metadata saved & tvshow.nfo updated');
    } finally {
      setBusy(false);
    }
  };

  const handleSaveNfo = async () => {
    setBusy(true);
    try {
      const res = await api.saveNfo('tvshow', show.id, nfoXml);
      setNfoVal(res.validation);
      await load();
      onUpdated();
      notify('tvshow.nfo validated and saved');
    } catch (e) {
      notify(`Validation error: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleMarkSeasonWatched = async (watched: boolean) => {
    const ids = visibleEpisodes.map((e) => e.id);
    if (ids.length === 0) return;
    setBusy(true);
    try {
      await api.batchEpisodes(watched ? 'markWatched' : 'markUnwatched', ids);
      await load();
      onUpdated();
      notify(`Updated ${ids.length} episode(s)`);
    } finally {
      setBusy(false);
    }
  };

  const handleBatchMissingSubs = async () => {
    setBusy(true);
    try {
      const res = await api.batchMissingSubtitles({ episodeIds: visibleEpisodes.map((e) => e.id) });
      await load();
      onUpdated();
      notify(`Downloaded ${res.downloaded} subtitle(s)`);
    } finally {
      setBusy(false);
    }
  };

  const handleRenameShowEpisodes = async () => {
    setBusy(true);
    try {
      const prev = await api.previewRename({ episodeIds: visibleEpisodes.map((e) => e.id) });
      const actionable = prev.items.filter((i) => i.hasChanges && !i.conflict);
      if (actionable.length === 0) {
        notify('All episode filenames already match Kodi pattern');
      } else {
        const res = await api.executeRename(actionable, true);
        await load();
        onUpdated();
        notify(`Renamed ${res.movedCount} episode file(s)`);
      }
    } finally {
      setBusy(false);
    }
  };

  const handlePickArtwork = async (kind: ArtworkKind, url?: string, dataBase64?: string) => {
    await api.setShowArtwork(show.id, kind, url, dataBase64);
    await load();
    onUpdated();
    notify(`Updated ${kind} artwork`);
  };

  const handlePickSeasonPoster = async (
    seasonId: number,
    seasonName: string,
    url?: string,
    dataBase64?: string
  ) => {
    await api.setSeasonArtwork(seasonId, 'poster', url, dataBase64);
    await load();
    onUpdated();
    notify(`Updated ${seasonName} poster`);
  };

  const openShowArtPicker = (
    kind: ArtworkKind,
    label: string,
    aspect: 'poster' | 'fanart' | 'banner' | 'square' | 'logo'
  ) => {
    setArtPickerTarget({
      mediaType: 'tvshow',
      mediaId: show.id,
      mediaTitle: `${show.title}${show.year ? ` (${show.year})` : ''}`,
      kind,
      label,
      aspect,
      currentPath: show.artwork[kind],
      initialCandidates: show.artworkCandidates?.[kind],
    });
  };

  const openSeasonArtPicker = (season: TvSeasonRecord) => {
    setArtPickerTarget({
      mediaType: 'season',
      mediaId: season.id,
      mediaTitle: `${show.title} · ${season.name}`,
      kind: 'poster',
      label: `${season.name} Poster`,
      aspect: 'poster',
      currentPath: season.posterPath ?? show.artwork.poster,
    });
  };

  const handleSaveActors = async (actors: ActorEntry[]) => {
    await api.updateShow(show.id, { actors, writeNfo: true });
    await load();
    onUpdated();
    notify(`Saved ${actors.length} cast member(s) & updated tvshow.nfo`);
  };

  const handleUploadActorThumb = async (actorName: string, dataBase64: string) => {
    const res = await api.uploadActorThumb({
      mediaType: 'tvshow',
      mediaId: show.id,
      actorName,
      dataBase64,
    });
    notify(`Saved portrait to .actors for ${actorName}`);
    return res.thumbPath;
  };

  const fanartUrl = getArtworkUrl(show.artwork.fanart, artCacheKey);
  const clearlogoUrl = getArtworkUrl(show.artwork.clearlogo, artCacheKey);
  const activeSeasonRecord = activeSeason !== 'all' ? seasons.find((s) => s.seasonNumber === activeSeason) ?? null : null;
  const otherArtPresentCount = SHOW_OTHER_ARTWORK_SLOTS.filter((s) => Boolean(show.artwork[s.kind])).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      <DetailHero
        fanartUrl={fanartUrl}
        onClose={onClose}
        leading={
          <>
            {tab !== 'metadata' && (
              <div className="w-11 shrink-0 shadow-lg">
                <PosterImage
                  filePath={activeSeasonRecord?.posterPath ?? show.artwork.poster}
                  alt={show.title}
                  cacheKey={artCacheKey}
                  compact
                />
              </div>
            )}
            {clearlogoUrl && (
              <img
                src={clearlogoUrl}
                alt={`${show.title} logo`}
                className="hidden @lg:block h-8 max-w-[130px] object-contain shrink-0 drop-shadow"
              />
            )}
          </>
        }
        titleArea={
          <HeroTitle>
            {show.title}
            {show.year && <span className="ml-2 font-semibold text-slate-400">({show.year})</span>}
            {show.status && <HeroChip tone="sky">{show.status}</HeroChip>}
            {activeSeason !== 'all' && <HeroChip tone="amber">Season {activeSeason}</HeroChip>}
          </HeroTitle>
        }
        meta={
          <>
            <RatingBadges ratings={show.ratings} compact />
            <span className="whitespace-nowrap">
              {show.seasonsCount} Seasons · {show.episodesCount} Episodes ({show.watchedEpisodesCount} watched)
            </span>
            {missingEpisodes.length > 0 && (
              <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-300 text-[11px] font-semibold inline-flex items-center gap-1">
                <AlertCircle className="w-3 h-3" /> {missingEpisodes.length} Missing Aired
              </span>
            )}
          </>
        }
        actions={
          <>
            <button
              onClick={() => setScrapeOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5" /> Scrape Series
            </button>
            <button
              onClick={handleBatchMissingSubs}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <Languages className="w-3.5 h-3.5 text-sky-400" /> Fetch Subs
            </button>
            <button
              onClick={handleRenameShowEpisodes}
              disabled={busy}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              <FolderSync className="w-3.5 h-3.5 text-emerald-400" /> Rename Eps
            </button>
          </>
        }
        tabs={[
          { id: 'episodes' as const, label: `Episodes (${visibleEpisodes.length})`, icon: <Tv className="w-3.5 h-3.5" /> },
          ...(activeSeason !== 'all'
            ? [
                {
                  id: 'order' as const,
                  label: hasCustomSeasonOrder ? `Episode Order · Custom` : 'Episode Order',
                  icon: <ArrowUpDown className="w-3.5 h-3.5" />,
                },
              ]
            : []),
          { id: 'metadata' as const, label: 'Metadata & Art', icon: <Info className="w-3.5 h-3.5" /> },
          { id: 'cast' as const, label: `Cast (${show.actors.length})`, icon: <Users className="w-3.5 h-3.5" /> },
          { id: 'nfo' as const, label: 'tvshow.nfo XML', icon: <Code2 className="w-3.5 h-3.5" /> },
        ].map((t) => (
          <HeroTab key={t.id} active={tab === t.id} icon={t.icon} label={t.label} onClick={() => setTab(t.id as TvTab)} />
        ))}
        toast={toast}
      />

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-4 @xl:p-5 @container">
        {tab === 'episodes' && (
          <div className="space-y-3">
            {/* Season Pills & Quick Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                <button
                  onClick={() => {
                    setActiveSeason('all');
                    onSelectSeason?.(null);
                  }}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                    activeSeason === 'all' ? 'bg-sky-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-300'
                  }`}
                >
                  All Seasons ({episodes.length}
                  {missingEpisodes.length > 0 ? ` · ${missingEpisodes.length} missing` : ''})
                </button>
                {seasons.map((s) => {
                  const seasonLocalCount = episodes.filter(
                    (e) => (e.displaySeason ?? e.seasonNumber) === s.seasonNumber
                  ).length;
                  const seasonMissingCount = missingEpisodes.filter((m) => m.seasonNumber === s.seasonNumber).length;
                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        setActiveSeason(s.seasonNumber);
                        onSelectSeason?.(s.seasonNumber);
                      }}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                        activeSeason === s.seasonNumber
                          ? 'bg-sky-500 text-white'
                          : 'bg-slate-900 border border-slate-800 text-slate-300'
                      }`}
                    >
                      {s.name} ({seasonLocalCount}
                      {seasonMissingCount > 0 ? `/${seasonLocalCount + seasonMissingCount}` : ''})
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-1.5">
                {visibleMissing.length > 0 && (
                  <button
                    onClick={() => setShowMissingOnly((v) => !v)}
                    className={`px-2 py-1 rounded-md border text-[11px] font-semibold cursor-pointer inline-flex items-center gap-1 ${
                      showMissingOnly
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-200'
                        : 'bg-slate-900 border-slate-800 hover:border-amber-500/40 text-amber-300'
                    }`}
                  >
                    <CalendarClock className="w-3 h-3" />
                    {showMissingOnly ? `Show Local (${visibleEpisodes.length})` : `Missing Only (${visibleMissing.length})`}
                  </button>
                )}
                <button
                  onClick={() => handleMarkSeasonWatched(true)}
                  disabled={busy}
                  className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 cursor-pointer"
                >
                  Mark All Watched
                </button>
                <button
                  onClick={() => handleMarkSeasonWatched(false)}
                  disabled={busy}
                  className="px-2 py-1 rounded-md bg-slate-900 border border-slate-800 hover:border-slate-700 text-[11px] text-slate-300 cursor-pointer"
                >
                  Mark Unwatched
                </button>
              </div>
            </div>

            {/* Dense Episode List */}
            {!showMissingOnly && (
              <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/70 bg-slate-900/50 overflow-hidden">
                {visibleEpisodes.map((ep) => {
                const effSeason = ep.displaySeason ?? ep.seasonNumber;
                const effEp = ep.displayEpisode ?? ep.episodeNumber;
                const hasCustomOrder =
                  ep.displaySeason != null ||
                  ep.displayEpisode != null ||
                  (ep.parsedInfo.episodeNumber != null && ep.episodeNumber !== ep.parsedInfo.episodeNumber) ||
                  (ep.parsedInfo.seasonNumber != null && ep.seasonNumber !== ep.parsedInfo.seasonNumber);
                const fileCode = `S${String(ep.parsedInfo.seasonNumber ?? ep.seasonNumber).padStart(2, '0')}E${String(
                  ep.parsedInfo.episodeNumber ?? ep.episodeNumber
                ).padStart(2, '0')}`;
                const code = `S${String(effSeason).padStart(2, '0')}E${String(effEp).padStart(2, '0')}${
                  ep.multiEpisodeEnd ? `-E${String(ep.multiEpisodeEnd).padStart(2, '0')}` : ''
                }`;
                const partCount = Math.max(
                  1 + (ep.multiEpisodeParts?.length ?? 0),
                  ep.multiEpisodeEnd && ep.multiEpisodeEnd > ep.episodeNumber
                    ? ep.multiEpisodeEnd - ep.episodeNumber + 1
                    : 1
                );
                return (
                  <div
                    key={ep.id}
                    onClick={() => onSelectEpisode?.(ep.id)}
                    className={`px-3.5 py-2.5 flex items-center justify-between gap-3 transition ${
                      onSelectEpisode ? 'hover:bg-slate-800/60 cursor-pointer' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span
                        title={hasCustomOrder ? `Custom NFO order (File: ${fileCode})` : undefined}
                        className={`px-2 py-0.5 rounded font-mono text-xs font-bold shrink-0 ${
                          hasCustomOrder
                            ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                            : 'bg-sky-500/20 text-sky-300'
                        }`}
                      >
                        {code}
                      </span>
                      {partCount > 1 && (
                        <span className="px-1.5 py-0.5 rounded bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-[10px] font-semibold shrink-0">
                          {partCount} parts
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-100 truncate">{ep.title}</span>
                          {ep.aired && <span className="text-[11px] text-slate-500 shrink-0">{ep.aired}</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate mt-0.5">
                          {ep.plot || ep.fileName}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <TechBadges parsed={ep.parsedInfo} streamDetails={ep.streamDetails} />
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
                          ep.hasNfo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
                        }`}
                      >
                        {ep.hasNfo ? 'NFO' : 'No NFO'}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setScrapeTargetEp(ep);
                        }}
                        title="Scrape this episode"
                        className="px-2 py-1 rounded bg-indigo-500/20 hover:bg-indigo-500/30 border border-indigo-500/30 text-[11px] text-indigo-200 font-semibold flex items-center gap-1 cursor-pointer"
                      >
                        <Sparkles className="w-3 h-3 text-indigo-300" />
                        Scrape
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setSubTargetEp(ep);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Languages className="w-3 h-3 text-sky-400" />
                        {ep.subtitles.length}
                      </button>
                      <button
                        onClick={(e) => toggleEpisodeWatched(ep, e)}
                        className={`p-1.5 rounded border cursor-pointer transition ${
                          ep.watched
                            ? 'bg-purple-500/20 border-purple-500/40 text-purple-300 hover:bg-purple-500/30'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                        title={ep.watched ? 'Watched (click to mark unwatched)' : 'Unwatched (click to mark watched)'}
                      >
                        {ep.watched ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            )}

            {/* Missing Aired Episodes Completeness Panel */}
            {visibleMissing.length > 0 && (
              <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 overflow-hidden">
                <div className="px-3.5 py-2 border-b border-amber-500/20 flex items-center justify-between gap-2 bg-amber-500/10">
                  <div className="text-xs font-bold text-amber-200 flex items-center gap-1.5">
                    <CalendarClock className="w-3.5 h-3.5 text-amber-400" />
                    Missing Aired Episodes ({visibleMissing.length})
                  </div>
                  <span className="text-[11px] text-amber-300/80">
                    Compared against scraped series episode guide
                  </span>
                </div>
                <div className="divide-y divide-amber-500/10">
                  {visibleMissing.map((m) => (
                    <div key={m.code} className="px-3.5 py-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0 flex-1">
                        <span className="px-2 py-0.5 rounded font-mono text-xs font-bold bg-amber-500/15 border border-amber-500/30 text-amber-300 shrink-0">
                          {m.code}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-200 truncate">{m.title}</span>
                            {m.aired && <span className="text-[11px] text-slate-500 shrink-0">{m.aired}</span>}
                          </div>
                          {m.plot && <div className="text-[11px] text-slate-400 truncate mt-0.5">{m.plot}</div>}
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] font-bold uppercase text-amber-300 shrink-0">
                        Missing File
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'order' && activeSeason !== 'all' && (
          <div className="space-y-4 max-w-4xl">
            <div className="p-4 rounded-xl bg-slate-900/75 border border-slate-800 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <ArrowUpDown className="w-4 h-4 text-sky-400" />
                    Season {activeSeason} Preferred Episode Order (Kodi NFO)
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Drag rows or use the arrow buttons to set your preferred playback sequence without renaming video files.
                  </p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    onClick={handleSortOrderByAired}
                    disabled={busy}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 cursor-pointer"
                  >
                    Sort by Aired Date
                  </button>
                  <button
                    onClick={handleResetOrder}
                    disabled={busy}
                    className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                    Reset to File Order
                  </button>
                  <button
                    onClick={handleApplyOrder}
                    disabled={busy || orderDraft.length === 0}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {busy ? 'Writing NFOs...' : orderDirty ? 'Save Order & Write NFOs *' : 'Save Order & Write NFOs'}
                  </button>
                </div>
              </div>

              {/* NFO Tag Mode Selection */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => {
                    setOrderMode('display');
                    setOrderDirty(true);
                  }}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    orderMode === 'display'
                      ? 'bg-sky-500/15 border-sky-500/50 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold flex items-center justify-between">
                    <span>Display Order (&lt;displayseason&gt; / &lt;displayepisode&gt;)</span>
                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 text-[10px] font-bold">
                      RECOMMENDED
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Preserves original <code className="text-sky-300">&lt;season&gt;</code> &amp;{' '}
                    <code className="text-sky-300">&lt;episode&gt;</code> file identity while telling Kodi the visual order.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setOrderMode('canonical');
                    setOrderDirty(true);
                  }}
                  className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                    orderMode === 'canonical'
                      ? 'bg-sky-500/15 border-sky-500/50 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs font-bold">Canonical Override (&lt;season&gt; / &lt;episode&gt;)</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Directly overwrites <code className="text-sky-300">&lt;season&gt;</code> &amp;{' '}
                    <code className="text-sky-300">&lt;episode&gt;</code> in each episode&apos;s NFO and clears display tags.
                  </p>
                </button>
              </div>
            </div>

            {/* Reorderable Rows */}
            <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/70 bg-slate-900/50 overflow-hidden">
              {orderDraft.map((ep, idx) => {
                const targetNum = idx + 1;
                const fileCode = `S${String(ep.parsedInfo.seasonNumber ?? ep.seasonNumber).padStart(2, '0')}E${String(
                  ep.parsedInfo.episodeNumber ?? ep.episodeNumber
                ).padStart(2, '0')}`;
                const targetCode = `S${String(activeSeason).padStart(2, '0')}E${String(targetNum).padStart(2, '0')}`;
                return (
                  <div
                    key={ep.id}
                    draggable
                    onDragStart={() => setDragIdx(idx)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragIdx !== null && dragIdx !== idx) {
                        moveOrderItem(dragIdx, idx);
                      }
                      setDragIdx(null);
                    }}
                    onDragEnd={() => setDragIdx(null)}
                    className={`px-3.5 py-2.5 flex items-center justify-between gap-3 transition ${
                      dragIdx === idx ? 'bg-sky-500/20 opacity-75' : 'hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="cursor-grab text-slate-500 hover:text-slate-300 shrink-0" title="Drag to reorder">
                        <GripVertical className="w-4 h-4" />
                      </span>
                      <span className="w-7 h-7 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300 font-mono text-xs font-extrabold flex items-center justify-center shrink-0">
                        {targetNum}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-bold text-white truncate">{ep.title}</span>
                          {ep.aired && <span className="text-[11px] text-slate-500">{ep.aired}</span>}
                        </div>
                        <div className="text-[11px] text-slate-400 font-mono truncate mt-0.5">
                          File: {fileCode} · {ep.fileName}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="hidden sm:inline-block px-2 py-0.5 rounded bg-slate-950 border border-slate-800 font-mono text-[10px] text-amber-300">
                        {orderMode === 'display'
                          ? `<displayseason>${activeSeason}</displayseason> <displayepisode>${targetNum}</displayepisode>`
                          : `<season>${activeSeason}</season> <episode>${targetNum}</episode>`}{' '}
                        ({targetCode})
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => moveOrderItem(idx, idx - 1)}
                          aria-label={`Move ${ep.title} up`}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 cursor-pointer"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={idx === orderDraft.length - 1}
                          onClick={() => moveOrderItem(idx, idx + 1)}
                          aria-label={`Move ${ep.title} down`}
                          className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-slate-200 cursor-pointer"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'metadata' && (
          <div className="space-y-6">
            {/* Top Row: Show Poster in Top-Left + Metadata Fields */}
            <div className="flex flex-wrap items-start gap-3 @md:gap-5">
              <div className="w-28 @md:w-36 @3xl:w-44 shrink-0 space-y-2 @md:sticky @md:top-0">
                <ClickableArtCard
                  label="Series Poster (2:3)"
                  filePath={show.artwork.poster}
                  aspect="poster"
                  cacheKey={artCacheKey}
                  onClick={() => openShowArtPicker('poster', 'Series Poster (2:3)', 'poster')}
                />
              </div>

              <div className="min-w-[15rem] flex-1 basis-60 space-y-3 @container">
                <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-2.5">
                  <Field label="Show Title" value={form.title ?? ''} onChange={(v) => setForm({ ...form, title: v })} />
                  <Field label="Original Title" value={form.originalTitle ?? ''} onChange={(v) => setForm({ ...form, originalTitle: v })} />
                  <Field label="Sort Title" value={form.sortTitle ?? ''} onChange={(v) => setForm({ ...form, sortTitle: v })} />
                  <Field
                    label="Year"
                    type="number"
                    value={form.year != null ? String(form.year) : ''}
                    onChange={(v) => setForm({ ...form, year: v ? Number(v) : null })}
                  />
                  <Field label="Premiered" value={form.premiered ?? ''} onChange={(v) => setForm({ ...form, premiered: v })} />
                  <Field label="Status" value={form.status ?? ''} onChange={(v) => setForm({ ...form, status: v })} />
                  <Field label="MPAA" value={form.mpaa ?? ''} onChange={(v) => setForm({ ...form, mpaa: v })} />
                  <Field label="Studio / Network" value={form.studio ?? ''} onChange={(v) => setForm({ ...form, studio: v })} />
                  <Field
                    label="User Rating (1–10)"
                    type="number"
                    value={form.userRating != null ? String(form.userRating) : ''}
                    onChange={(v) => setForm({ ...form, userRating: v ? Number(v) : null })}
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">Series Overview</label>
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
                    suggestions={['Science Fiction', 'Drama', 'Mystery', 'Thriller', 'Action', 'Animation']}
                    accent="sky"
                  />
                  <ChipInput
                    label="Tags"
                    values={form.tags ?? []}
                    onChange={(tags) => setForm({ ...form, tags })}
                    suggestions={['4K', 'Continuing', 'Mini-Series', 'Favorites']}
                    accent="indigo"
                  />
                </div>

                <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-2.5">
                  <Field
                    label="TVDB ID"
                    value={form.uniqueIds?.tvdb ?? ''}
                    onChange={(v) => setForm({ ...form, uniqueIds: { ...(form.uniqueIds ?? {}), tvdb: v || undefined } })}
                  />
                  <Field
                    label="TMDb ID"
                    value={form.uniqueIds?.tmdb ?? ''}
                    onChange={(v) => setForm({ ...form, uniqueIds: { ...(form.uniqueIds ?? {}), tmdb: v || undefined } })}
                  />
                  <Field
                    label="IMDb ID"
                    value={form.uniqueIds?.imdb ?? ''}
                    onChange={(v) => setForm({ ...form, uniqueIds: { ...(form.uniqueIds ?? {}), imdb: v || undefined } })}
                  />
                  <Field
                    label="TVmaze ID"
                    value={form.uniqueIds?.tvmaze ?? ''}
                    onChange={(v) => setForm({ ...form, uniqueIds: { ...(form.uniqueIds ?? {}), tvmaze: v || undefined } })}
                  />
                </div>

                <div className="flex justify-end pt-2 border-t border-slate-800">
                  <button
                    onClick={handleSaveMetadata}
                    disabled={busy}
                    className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    {busy ? 'Saving...' : 'Save & Write tvshow.nfo'}
                  </button>
                </div>
              </div>
            </div>

            {/* Bottom Section: Other Show & Season Artwork Below Metadata Fields */}
            <div id="show-artwork-section" className="pt-4 border-t border-slate-800/90 space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-sky-400" /> Show Artwork
                  </h3>
                  <span className="text-[11px] text-slate-400">
                    {otherArtPresentCount} / {SHOW_OTHER_ARTWORK_SLOTS.length} present
                  </span>
                </div>
                <div className="grid grid-cols-1 @lg:grid-cols-2 @3xl:grid-cols-3 gap-3.5">
                  {SHOW_OTHER_ARTWORK_SLOTS.map((slot) => (
                    <ClickableArtCard
                      key={slot.kind}
                      label={slot.label}
                      filePath={show.artwork[slot.kind]}
                      aspect={slot.aspect}
                      cacheKey={artCacheKey}
                      onClick={() => openShowArtPicker(slot.kind, slot.label, slot.aspect)}
                    />
                  ))}
                </div>
              </div>

              {seasons.length > 0 && (
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5">Season Posters</h4>
                  <div className="grid grid-cols-2 @3xl:grid-cols-4 @5xl:grid-cols-6 gap-3">
                    {seasons.map((s) => (
                      <ClickableArtCard
                        key={s.id}
                        label={s.name}
                        filePath={s.posterPath ?? show.artwork.poster}
                        aspect="poster"
                        cacheKey={artCacheKey}
                        statusLabel={s.posterPath ? 'Custom' : 'Inherited'}
                        onClick={() => openSeasonArtPicker(s)}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {tab === 'cast' && (
          <CastListColumn
            actors={show.actors}
            label="Series Cast"
            activeActor={activeActor}
            onSelectActor={onSelectActor}
            onSaveActors={handleSaveActors}
            onUploadActorThumb={handleUploadActorThumb}
          />
        )}

        {tab === 'nfo' && (
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-xs text-slate-400 flex items-center gap-1.5">
                <FileCode2 className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  Target file: <code className="text-sky-300">{show.nfoPath ?? 'tvshow.nfo'}</code>
                </span>
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
                  disabled={busy}
                  className="px-3 py-1 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" /> Save tvshow.nfo
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
      </div>

      <ScrapeModal
        open={scrapeOpen}
        mediaKind="tvshow"
        mediaId={show.id}
        initialQuery={show.title}
        initialYear={show.year}
        onApplied={() => {
          void load();
          onUpdated();
        }}
        onClose={() => setScrapeOpen(false)}
      />

      {subTargetEp && (
        <SubtitleSearchModal
          open={true}
          mediaType="episode"
          mediaId={subTargetEp.id}
          mediaTitle={`${show.title} S${String(subTargetEp.seasonNumber).padStart(2, '0')}E${String(
            subTargetEp.episodeNumber
          ).padStart(2, '0')}`}
          onDownloaded={() => {
            void load();
            onUpdated();
          }}
          onClose={() => setSubTargetEp(null)}
        />
      )}

      {scrapeTargetEp && (
        <EpisodeScrapeModal
          open={true}
          show={show}
          episode={scrapeTargetEp}
          onClose={() => setScrapeTargetEp(null)}
          onApplied={() => {
            void load();
            onUpdated();
            notify('Episode metadata & NFO scraped cleanly');
          }}
        />
      )}

      <ArtworkPickerModal
        target={artPickerTarget}
        cacheKey={artCacheKey}
        onApply={({ url, dataBase64 }) => {
          if (!artPickerTarget) return;
          if (artPickerTarget.mediaType === 'season') {
            return handlePickSeasonPoster(artPickerTarget.mediaId, artPickerTarget.label, url, dataBase64);
          }
          return handlePickArtwork(artPickerTarget.kind, url, dataBase64);
        }}
        onClose={() => setArtPickerTarget(null)}
      />
    </div>
  );
};
