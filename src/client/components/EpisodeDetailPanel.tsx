import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Code2,
  Eye,
  EyeOff,
  FileCode2,
  FolderSync,
  Info,
  Languages,
  Save,
  Star,
  Subtitles,
  Trash2,
} from 'lucide-react';
import type { NfoValidationReport, TvEpisodeRecord, TvShowRecord } from '../../shared/types.js';
import { api, formatBytes } from '../lib/api.js';
import { PosterImage } from './PosterImage.js';
import { TechBadges } from './QualityBadges.js';
import { SubtitleEditorModal, SubtitleSearchModal } from './SubtitleSearchModal.js';

type EpisodeTab = 'metadata' | 'subtitles' | 'nfo' | 'mediainfo';

export const EpisodeDetailPanel: React.FC<{
  showId: number;
  episodeId: number;
  onSelectShow: (showId: number, seasonNumber?: number | null) => void;
  onUpdated: () => void;
}> = ({ showId, episodeId, onSelectShow, onUpdated }) => {
  const [show, setShow] = useState<TvShowRecord | null>(null);
  const [episode, setEpisode] = useState<TvEpisodeRecord | null>(null);
  const [form, setForm] = useState<Partial<TvEpisodeRecord>>({});
  const [tab, setTab] = useState<EpisodeTab>('metadata');
  const [nfoXml, setNfoXml] = useState('');
  const [nfoVal, setNfoVal] = useState<NfoValidationReport | null>(null);
  const [subSearchOpen, setSubSearchOpen] = useState(false);
  const [editSubId, setEditSubId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const load = async () => {
    const res = await api.getShow(showId);
    setShow(res.show);
    const ep = res.episodes.find((e) => e.id === episodeId) ?? null;
    setEpisode(ep);
    if (ep) {
      setForm(ep);
      const nfo = await api.readNfo('episode', ep.id);
      setNfoXml(nfo.xml);
      setNfoVal(nfo.validation);
    }
  };

  useEffect(() => {
    setTab('metadata');
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showId, episodeId]);

  if (!show || !episode) {
    return <div className="p-6 text-xs text-slate-400">Loading episode details...</div>;
  }

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const epCode = `S${String(episode.seasonNumber).padStart(2, '0')}E${String(episode.episodeNumber).padStart(2, '0')}${
    episode.multiEpisodeEnd ? `-${String(episode.multiEpisodeEnd).padStart(2, '0')}` : ''
  }`;

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
        watched: form.watched,
        playCount: form.watched ? Math.max(1, form.playCount ?? 1) : 0,
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Breadcrumb + Episode Hero */}
      <div className="border-b border-slate-800 bg-[#0e1524] shrink-0">
        <div className="px-5 pt-2.5 pb-1 flex items-center gap-2 text-[11px] text-slate-400">
          <button
            onClick={() => onSelectShow(show.id, null)}
            className="text-sky-300 hover:text-sky-200 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <ArrowLeft className="w-3 h-3" /> {show.title}
          </button>
          <span>/</span>
          <button
            onClick={() => onSelectShow(show.id, episode.seasonNumber)}
            className="hover:text-slate-200 cursor-pointer"
          >
            Season {episode.seasonNumber}
          </button>
          <span>/</span>
          <span className="font-mono text-slate-200">{epCode}</span>
        </div>

        <div className="px-5 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0 flex-1">
            <div className="w-28 shrink-0">
              <PosterImage filePath={episode.thumbPath ?? show.artwork.fanart} alt={episode.title} aspect="fanart" />
            </div>
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
              className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                episode.watched
                  ? 'bg-emerald-500/20 border-emerald-500/40 text-emerald-300'
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

        {/* Sub-Tabs */}
        <div className="px-5 bg-[#0b0f17]/85 flex items-center gap-1 overflow-x-auto border-t border-slate-800/80">
          {[
            { id: 'metadata', label: 'Episode Metadata', icon: <Info className="w-3.5 h-3.5" /> },
            { id: 'subtitles', label: `Subtitles (${episode.subtitles.length})`, icon: <Subtitles className="w-3.5 h-3.5" /> },
            { id: 'nfo', label: 'Episode NFO XML', icon: <Code2 className="w-3.5 h-3.5" /> },
            { id: 'mediainfo', label: 'MediaInfo & Paths', icon: <FileCode2 className="w-3.5 h-3.5" /> },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id as EpisodeTab)}
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
          <div className="space-y-3 max-w-4xl">
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
                rows={4}
                value={form.plot ?? ''}
                onChange={(e) => setForm({ ...form, plot: e.target.value })}
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 leading-relaxed"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <Field
                label="Directors (comma separated)"
                value={(form.directors ?? []).join(', ')}
                onChange={(v) => setForm({ ...form, directors: v.split(',').map((s) => s.trim()).filter(Boolean) })}
              />
              <Field
                label="Writers / Credits (comma separated)"
                value={(form.writers ?? []).join(', ')}
                onChange={(v) => setForm({ ...form, writers: v.split(',').map((s) => s.trim()).filter(Boolean) })}
              />
            </div>

            <div className="flex items-center justify-between pt-2 border-t border-slate-800">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setForm({ ...form, watched: !form.watched })}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold border flex items-center gap-1.5 cursor-pointer ${
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
        )}

        {tab === 'subtitles' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-slate-100">Episode Sidecar Subtitles</h4>
                <p className="text-xs text-slate-400">
                  OpenSubtitles 64-bit hash: <code className="text-sky-300">{episode.movieHash}</code>
                </p>
              </div>
              <button
                onClick={() => setSubSearchOpen(true)}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Languages className="w-3.5 h-3.5" /> Search & Download
              </button>
            </div>

            {episode.subtitles.length === 0 ? (
              <div className="p-6 rounded-xl border border-dashed border-slate-700 text-center text-xs text-slate-400">
                No subtitles attached to this episode yet.
              </div>
            ) : (
              <div className="space-y-2">
                {episode.subtitles.map((s) => (
                  <div key={s.id} className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-xs font-bold uppercase">{s.language}</span>
                        <span className="text-xs text-slate-400">
                          {s.cueCount ?? 0} cues • {formatBytes(s.sizeBytes)}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-slate-200 mt-1">{s.fileName}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setEditSubId(s.id)}
                        className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 font-semibold cursor-pointer"
                      >
                        Preview & Sync
                      </button>
                      <button
                        onClick={async () => {
                          await api.deleteSubtitle(s.id);
                          await load();
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
          <div className="space-y-3 text-xs">
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
              <div className="font-semibold text-slate-200">File & Hash Details</div>
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
