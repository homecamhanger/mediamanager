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
  Tv,
  X,
} from 'lucide-react';
import type { NfoValidationReport, TvEpisodeRecord, TvSeasonRecord, TvShowRecord } from '../../shared/types.js';
import { api, getArtworkUrl } from '../lib/api.js';
import { PosterImage } from './PosterImage.js';
import { TechBadges } from './QualityBadges.js';
import { RatingBadges } from './RatingBadges.js';
import { ScrapeModal } from './ScrapeModal.js';
import { SubtitleSearchModal } from './SubtitleSearchModal.js';

type TvTab = 'episodes' | 'metadata' | 'artwork' | 'nfo';

export const TvShowDetailPanel: React.FC<{
  showId: number;
  selectedSeason?: number | null;
  onSelectSeason?: (seasonNumber: number | null) => void;
  onSelectEpisode?: (episodeId: number) => void;
  onUpdated: () => void;
  onClose?: () => void;
}> = ({ showId, selectedSeason = null, onSelectSeason, onSelectEpisode, onUpdated, onClose }) => {
  const [show, setShow] = useState<TvShowRecord | null>(null);
  const [seasons, setSeasons] = useState<TvSeasonRecord[]>([]);
  const [episodes, setEpisodes] = useState<TvEpisodeRecord[]>([]);
  const [activeSeason, setActiveSeason] = useState<number | 'all'>(selectedSeason ?? 'all');
  const [tab, setTab] = useState<TvTab>('episodes');
  const [form, setForm] = useState<Partial<TvShowRecord>>({});
  const [nfoXml, setNfoXml] = useState('');
  const [nfoVal, setNfoVal] = useState<NfoValidationReport | null>(null);
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [subTargetEp, setSubTargetEp] = useState<TvEpisodeRecord | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    const res = await api.getShow(showId);
    setShow(res.show);
    setForm(res.show);
    setSeasons(res.seasons);
    setEpisodes(res.episodes);
    const nfo = await api.readNfo('tvshow', showId);
    setNfoXml(nfo.xml);
    setNfoVal(nfo.validation);
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId]);

  useEffect(() => {
    setActiveSeason(selectedSeason ?? 'all');
  }, [selectedSeason, showId]);

  if (!show) {
    return <div className="p-6 text-xs text-slate-400">Loading TV series...</div>;
  }

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const visibleEpisodes =
    activeSeason === 'all' ? episodes : episodes.filter((e) => e.seasonNumber === activeSeason);

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

  const fanartUrl = getArtworkUrl(show.artwork.fanart);

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Compact Show Hero */}
      <div className="relative border-b border-slate-800 shrink-0">
        {fanartUrl && (
          <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: `url("${fanartUrl}")` }} />
        )}
        <div
          className={`relative bg-gradient-to-r from-[#0b0f17]/95 via-[#0f1522]/90 to-[#0f1522]/85 px-5 py-3 ${
            onClose ? 'pr-16' : ''
          } flex flex-wrap items-center justify-between gap-3`}
        >
          {onClose && (
            <button
              onClick={onClose}
              aria-label="Close modal"
              title="Close (Esc)"
              className="absolute top-3 right-4 z-20 p-2 rounded-lg text-slate-300 bg-slate-900/75 hover:bg-slate-800 hover:text-white border border-slate-700/70 cursor-pointer transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-14 shrink-0 shadow-lg">
              <PosterImage filePath={show.artwork.poster} alt={show.title} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-lg font-bold text-white truncate">{show.title}</h2>
                {show.year && <span className="text-slate-400 text-sm">({show.year})</span>}
                <span className="px-2 py-0.5 rounded bg-slate-800 text-[11px] font-semibold text-sky-300">{show.status}</span>
                {activeSeason !== 'all' && (
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-300 text-[11px] font-bold">
                    Season {activeSeason}
                  </span>
                )}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                <RatingBadges ratings={show.ratings} compact />
                <span>
                  {show.seasonsCount} Seasons · {show.episodesCount} Episodes ({show.watchedEpisodesCount} watched)
                </span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap shrink-0">
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
          </div>
        </div>

        {/* Sub-Tabs */}
        <div className="relative px-5 bg-[#0b0f17]/85 flex items-center gap-1 overflow-x-auto border-t border-slate-800/80">
          {[
            { id: 'episodes', label: `Episodes (${visibleEpisodes.length})`, icon: <Tv className="w-3.5 h-3.5" /> },
            { id: 'metadata', label: 'Series Metadata', icon: <Info className="w-3.5 h-3.5" /> },
            { id: 'artwork', label: 'Show & Season Artwork', icon: <ImageIcon className="w-3.5 h-3.5" /> },
            { id: 'nfo', label: 'tvshow.nfo XML', icon: <Code2 className="w-3.5 h-3.5" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as TvTab)}
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

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-5">
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
                  All Seasons ({episodes.length})
                </button>
                {seasons.map((s) => (
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
                    {s.name} ({episodes.filter((e) => e.seasonNumber === s.seasonNumber).length})
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1.5">
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
            <div className="rounded-xl border border-slate-800 divide-y divide-slate-800/70 bg-slate-900/50 overflow-hidden">
              {visibleEpisodes.map((ep) => {
                const code = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}${
                  ep.multiEpisodeEnd ? `-${String(ep.multiEpisodeEnd).padStart(2, '0')}` : ''
                }`;
                return (
                  <div
                    key={ep.id}
                    onClick={() => onSelectEpisode?.(ep.id)}
                    className={`px-3.5 py-2.5 flex items-center justify-between gap-3 transition ${
                      onSelectEpisode ? 'hover:bg-slate-800/60 cursor-pointer' : ''
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-mono text-xs font-bold shrink-0">
                        {code}
                      </span>
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
                          setSubTargetEp(ep);
                        }}
                        className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Languages className="w-3 h-3 text-sky-400" />
                        {ep.subtitles.length}
                      </button>
                      <button
                        onClick={(e) => toggleEpisodeWatched(ep, e)}
                        className={`p-1.5 rounded border cursor-pointer ${
                          ep.watched
                            ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
                            : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                        title="Toggle watched"
                      >
                        {ep.watched ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {tab === 'metadata' && (
          <div className="space-y-3 max-w-4xl">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
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

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
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
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
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
        )}

        {tab === 'artwork' && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
              {(['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'landscape'] as const).map((kind) => (
                <div key={kind} className="p-3 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
                  <div className="text-xs font-bold text-slate-200 uppercase">{kind}</div>
                  <PosterImage
                    filePath={show.artwork[kind]}
                    alt={kind}
                    aspect={kind === 'poster' ? 'poster' : kind === 'banner' ? 'banner' : kind === 'clearlogo' ? 'logo' : 'fanart'}
                  />
                </div>
              ))}
            </div>
            {seasons.length > 0 && (
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Season Posters</h4>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
                  {seasons.map((s) => (
                    <div key={s.id} className="space-y-1">
                      <PosterImage filePath={s.posterPath} alt={s.name} />
                      <div className="text-[11px] font-semibold text-center text-slate-300">{s.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
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
