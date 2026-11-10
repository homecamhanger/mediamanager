import React, { useEffect, useState } from 'react';
import { Check, Code2, Eye, EyeOff, FolderSync, Languages, Sparkles, Subtitles, X } from 'lucide-react';
import type { TvEpisodeRecord, TvSeasonRecord, TvShowRecord } from '../../shared/types.js';
import { api, getArtworkUrl } from '../lib/api.js';
import { useEscapeKey } from '../lib/useEscapeKey.js';
import { PosterImage } from './PosterImage.js';
import { CompletenessPills, TechBadges } from './QualityBadges.js';
import { RatingBadges } from './RatingBadges.js';
import { ScrapeModal } from './ScrapeModal.js';
import { SubtitleEditorModal, SubtitleSearchModal } from './SubtitleSearchModal.js';

export const TvShowDetailModal: React.FC<{
  showId: number | null;
  onUpdated: () => void;
  onClose: () => void;
}> = ({ showId, onUpdated, onClose }) => {
  const [show, setShow] = useState<TvShowRecord | null>(null);
  const [seasons, setSeasons] = useState<TvSeasonRecord[]>([]);
  const [episodes, setEpisodes] = useState<TvEpisodeRecord[]>([]);
  const [selectedSeason, setSelectedSeason] = useState<number | 'all'>('all');
  const [scrapeOpen, setScrapeOpen] = useState(false);
  const [subTargetEp, setSubTargetEp] = useState<TvEpisodeRecord | null>(null);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [nfoTarget, setNfoTarget] = useState<{ mediaType: 'tvshow' | 'episode'; mediaId: number; xml: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const loadShow = async () => {
    if (!showId) return;
    const data = await api.getShow(showId);
    setShow(data.show);
    setSeasons(data.seasons);
    setEpisodes(data.episodes);
  };

  useEffect(() => {
    if (showId) {
      setSelectedSeason('all');
      setNfoTarget(null);
      void loadShow();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId]);

  const hasChildModal = scrapeOpen || Boolean(subTargetEp) || editSubId !== null;
  useEscapeKey(Boolean(showId) && !hasChildModal, onClose);

  if (!showId || !show) return null;

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const visibleEpisodes =
    selectedSeason === 'all' ? episodes : episodes.filter((e) => e.seasonNumber === selectedSeason);

  const toggleEpisodeWatched = async (ep: TvEpisodeRecord) => {
    await api.updateEpisode(ep.id, {
      watched: !ep.watched,
      playCount: !ep.watched ? 1 : 0,
      writeNfo: true,
    });
    await loadShow();
    onUpdated();
  };

  const handleRenameAllEpisodes = async () => {
    const prev = await api.previewRename({ episodeIds: episodes.map((e) => e.id) });
    const actionable = prev.items.filter((i) => i.hasChanges && !i.conflict);
    if (actionable.length === 0) {
      notify('All episodes already match Kodi naming rules');
      return;
    }
    const res = await api.executeRename(actionable, true);
    await loadShow();
    onUpdated();
    notify(`Renamed ${res.movedCount} episodes & sidecars`);
  };

  const handleBatchSubs = async () => {
    const res = await api.batchMissingSubtitles({ episodeIds: episodes.map((e) => e.id) });
    await loadShow();
    onUpdated();
    notify(`Downloaded ${res.downloaded} missing episode subtitles`);
  };

  const openNfo = async (mediaType: 'tvshow' | 'episode', mediaId: number) => {
    const res = await api.readNfo(mediaType, mediaId);
    setNfoTarget({ mediaType, mediaId, xml: res.xml });
  };

  const fanartUrl = getArtworkUrl(show.artwork.fanart);

  return (
    <div className="fixed inset-0 z-40 bg-black/80 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5">
      <div className="bg-[#0f1522] border border-slate-700/80 rounded-2xl w-full max-w-6xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="relative border-b border-slate-800">
          {fanartUrl && (
            <div className="absolute inset-0 bg-cover bg-center opacity-20" style={{ backgroundImage: `url("${fanartUrl}")` }} />
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
                <PosterImage filePath={show.artwork.poster} alt={show.title} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-bold text-white">{show.title}</h2>
                  {show.year && <span className="text-slate-400">({show.year})</span>}
                  <span className="px-2 py-0.5 rounded bg-slate-800 text-xs font-semibold text-sky-300">{show.status}</span>
                  {show.mpaa && <span className="px-2 py-0.5 rounded bg-slate-800 text-xs text-slate-300">{show.mpaa}</span>}
                </div>
                <div className="mt-1.5 flex items-center gap-3 flex-wrap">
                  <RatingBadges ratings={show.ratings} />
                  <span className="text-xs text-slate-400">
                    {show.seasonsCount} Seasons • {show.episodesCount} Episodes • {show.watchedEpisodesCount}/{show.episodesCount} Watched
                  </span>
                </div>
                {show.plot && <p className="text-xs text-slate-300 line-clamp-2 mt-1.5 max-w-2xl">{show.plot}</p>}
              </div>
            </div>

            <div className="flex items-center gap-2 flex-wrap shrink-0">
              <button
                onClick={() => setScrapeOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" /> Scrape Show & Episodes
              </button>
              <button
                onClick={handleBatchSubs}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Languages className="w-3.5 h-3.5 text-sky-400" /> Fetch Missing Subs
              </button>
              <button
                onClick={handleRenameAllEpisodes}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <FolderSync className="w-3.5 h-3.5 text-emerald-400" /> Rename Episodes
              </button>
              <button
                onClick={() => openNfo('tvshow', show.id)}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" /> tvshow.nfo
              </button>
            </div>
          </div>

          <div className="relative px-6 py-2 bg-[#0b0f17]/80 border-t border-slate-800/80 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              <button
                onClick={() => setSelectedSeason('all')}
                className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                  selectedSeason === 'all' ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40' : 'bg-slate-900 text-slate-400'
                }`}
              >
                All Seasons ({episodes.length})
              </button>
              {seasons.map((s) => (
                <button
                  key={s.seasonNumber}
                  onClick={() => setSelectedSeason(s.seasonNumber)}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer ${
                    selectedSeason === s.seasonNumber
                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                      : 'bg-slate-900 text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {s.name} ({s.episodesCount})
                </button>
              ))}
            </div>
            {toast && (
              <span className="text-xs text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-md">
                {toast}
              </span>
            )}
          </div>
        </div>

        {/* Episodes Table / NFO Inspector */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {nfoTarget ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-300">
                  Editing {nfoTarget.mediaType === 'tvshow' ? 'tvshow.nfo' : 'Episode NFO'}
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setNfoTarget(null)}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 text-xs text-slate-300 cursor-pointer"
                  >
                    Back to Episodes
                  </button>
                  <button
                    onClick={async () => {
                      await api.saveNfo(nfoTarget.mediaType, nfoTarget.mediaId, nfoTarget.xml);
                      await loadShow();
                      onUpdated();
                      setNfoTarget(null);
                      notify('NFO saved to disk');
                    }}
                    className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" /> Save NFO
                  </button>
                </div>
              </div>
              <textarea
                value={nfoTarget.xml}
                onChange={(e) => setNfoTarget({ ...nfoTarget, xml: e.target.value })}
                rows={18}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-xs font-mono text-emerald-200"
              />
            </div>
          ) : (
            <div className="space-y-2.5">
              {visibleEpisodes.map((ep) => (
                <div
                  key={ep.id}
                  className="p-3 rounded-xl bg-slate-900/75 border border-slate-800 hover:border-slate-700 flex flex-col sm:flex-row sm:items-center gap-4"
                >
                  <div className="w-36 shrink-0">
                    <PosterImage filePath={ep.thumbPath} alt={`S${ep.seasonNumber}E${ep.episodeNumber}`} aspect="fanart" />
                  </div>
                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-xs font-bold font-mono">
                        S{String(ep.seasonNumber).padStart(2, '0')}E{String(ep.episodeNumber).padStart(2, '0')}
                        {ep.multiEpisodeEnd ? `-E${String(ep.multiEpisodeEnd).padStart(2, '0')}` : ''}
                      </span>
                      <span className="font-bold text-sm text-slate-100">{ep.title}</span>
                      {ep.aired && <span className="text-xs text-slate-400">{ep.aired}</span>}
                    </div>
                    {ep.plot && <p className="text-xs text-slate-400 line-clamp-2">{ep.plot}</p>}
                    <div className="flex flex-wrap items-center gap-2 pt-0.5">
                      <TechBadges parsed={ep.parsedInfo} streamDetails={ep.streamDetails} />
                      <CompletenessPills
                        hasNfo={ep.hasNfo}
                        hasPoster={Boolean(ep.thumbPath)}
                        subtitles={ep.subtitles}
                        watched={ep.watched}
                      />
                    </div>
                  </div>
                  <div className="flex sm:flex-col items-end gap-1.5 shrink-0">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => toggleEpisodeWatched(ep)}
                        title="Toggle watched"
                        className={`p-1.5 rounded-lg border cursor-pointer ${
                          ep.watched ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300' : 'bg-slate-800 border-slate-700 text-slate-400'
                        }`}
                      >
                        {ep.watched ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => setSubTargetEp(ep)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Subtitles className="w-3.5 h-3.5 text-sky-400" /> Subs ({ep.subtitles.length})
                      </button>
                      <button
                        onClick={() => openNfo('episode', ep.id)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 flex items-center gap-1 cursor-pointer"
                      >
                        <Code2 className="w-3.5 h-3.5" /> NFO
                      </button>
                    </div>
                    {ep.subtitles[0] && (
                      <button
                        onClick={() => setEditSubId(ep.subtitles[0].id)}
                        className="text-[11px] text-sky-400 hover:underline cursor-pointer"
                      >
                        Sync {ep.subtitles[0].fileName}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <ScrapeModal
        open={scrapeOpen}
        mediaKind="tvshow"
        mediaId={show.id}
        initialQuery={show.title}
        initialYear={show.year}
        onApplied={() => {
          void loadShow();
          onUpdated();
          notify('Show & episodes scraped + NFOs written');
        }}
        onClose={() => setScrapeOpen(false)}
      />

      {subTargetEp && (
        <SubtitleSearchModal
          open={Boolean(subTargetEp)}
          mediaType="episode"
          mediaId={subTargetEp.id}
          mediaTitle={`${show.title} S${String(subTargetEp.seasonNumber).padStart(2, '0')}E${String(subTargetEp.episodeNumber).padStart(2, '0')} - ${subTargetEp.title}`}
          onDownloaded={() => {
            void loadShow();
            onUpdated();
          }}
          onClose={() => setSubTargetEp(null)}
        />
      )}

      <SubtitleEditorModal
        subtitleId={editSubId}
        onUpdated={() => {
          void loadShow();
          onUpdated();
        }}
        onClose={() => setEditSubId(null)}
      />
    </div>
  );
};
