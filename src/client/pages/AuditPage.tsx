import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Copy,
  FileCode2,
  Languages,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import type { LibraryAuditReport, MissingEpisodeRecord } from '../../shared/types.js';
import { api } from '../lib/api.js';
import type { InspectorFocusTab } from '../lib/workspaceTypes.js';

export const AuditPage: React.FC<{
  onRefresh: () => void;
  onOpenMovie?: (movieId: number, focusTab?: InspectorFocusTab) => void;
  onOpenShow?: (showId: number, focusTab?: InspectorFocusTab) => void;
  onOpenEpisode?: (showId: number, episodeId: number, focusTab?: InspectorFocusTab) => void;
}> = ({ onRefresh, onOpenMovie, onOpenShow, onOpenEpisode }) => {
  const [audit, setAudit] = useState<LibraryAuditReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [editionMovieId, setEditionMovieId] = useState<number | null>(null);
  const [editionInput, setEditionInput] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{
    kind: 'movie' | 'episode';
    id: number;
    deleteFiles: boolean;
  } | null>(null);

  const load = async () => {
    setAudit(await api.getAudit());
  };

  useEffect(() => {
    void load();
  }, []);

  if (!audit) return <div className="p-8 text-sm text-slate-400">Auditing library health...</div>;

  const { summary, issues } = audit;

  const fixUnscraped = async () => {
    setBusy('scrape');
    try {
      await api.batchScrape({ onlyUnscraped: true });
      await load();
      onRefresh();
    } finally {
      setBusy(null);
    }
  };

  const fixMissingNfos = async () => {
    setBusy('nfo');
    try {
      await api.regenerateNfos({ scope: 'all' });
      await load();
      onRefresh();
    } finally {
      setBusy(null);
    }
  };

  const fixMissingSubs = async () => {
    setBusy('subs');
    try {
      await api.batchMissingSubtitles({});
      await load();
      onRefresh();
    } finally {
      setBusy(null);
    }
  };

  const handleTagEdition = async (movieId: number, edition: string) => {
    await api.setMovieEdition(movieId, edition);
    setEditionMovieId(null);
    setEditionInput('');
    await load();
    onRefresh();
  };

  const handleConfirmDelete = async () => {
    if (!pendingDelete) return;
    if (pendingDelete.kind === 'movie') {
      await api.deleteMovie(pendingDelete.id, pendingDelete.deleteFiles);
    } else {
      await api.deleteEpisode(pendingDelete.id, pendingDelete.deleteFiles);
    }
    setPendingDelete(null);
    await load();
    onRefresh();
  };

  const missingByShow = new Map<number, { showTitle: string; items: MissingEpisodeRecord[] }>();
  for (const m of issues.missingEpisodes ?? []) {
    const grp = missingByShow.get(m.showId) ?? { showTitle: m.showTitle, items: [] };
    grp.items.push(m);
    missingByShow.set(m.showId, grp);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-amber-400" /> Library Health Audit & Duplicate Finder
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Detect missing metadata, NFOs, artwork, subtitles, duplicate media files, and low-resolution videos.
          </p>
        </div>

        <div className="px-4 py-2 rounded-2xl bg-[#111827] border border-slate-800 flex items-center gap-3">
          <span className="text-xs text-slate-400">Health Score</span>
          <span className={`text-xl font-extrabold ${summary.healthScore >= 85 ? 'text-emerald-400' : 'text-amber-400'}`}>
            {summary.healthScore}%
          </span>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <AuditSection
          title={`Unscraped Items (${issues.unscrapedMovies.length + issues.unscrapedShows.length})`}
          emptyText="Every movie and TV show has been scraped!"
          actionLabel={busy === 'scrape' ? 'Scraping...' : 'Auto-Scrape All'}
          actionIcon={<Sparkles className="w-3.5 h-3.5" />}
          onAction={issues.unscrapedMovies.length + issues.unscrapedShows.length > 0 ? fixUnscraped : undefined}
        >
          {issues.unscrapedMovies.map((m) => (
            <button
              key={`m-${m.id}`}
              onClick={() => onOpenMovie?.(m.id)}
              className="w-full text-left text-xs text-slate-300 hover:text-sky-300 flex justify-between gap-2 cursor-pointer"
            >
              <span className="font-semibold text-white">Movie: {m.title}</span>
              <span className="font-mono text-[11px] text-slate-500 truncate max-w-xs">{m.filePath}</span>
            </button>
          ))}
          {issues.unscrapedShows.map((s) => (
            <button
              key={`s-${s.id}`}
              onClick={() => onOpenShow?.(s.id)}
              className="w-full text-left text-xs text-slate-300 hover:text-sky-300 flex justify-between gap-2 cursor-pointer"
            >
              <span className="font-semibold text-white">TV Show: {s.title}</span>
              <span className="font-mono text-[11px] text-slate-500 truncate max-w-xs">{s.folderPath}</span>
            </button>
          ))}
        </AuditSection>

        <AuditSection
          title={`Missing NFO Files (${issues.missingMovieNfo.length + issues.missingEpisodeNfo.length})`}
          emptyText="All movies and episodes have NFO XML files on disk."
          actionLabel={busy === 'nfo' ? 'Writing...' : 'Generate Missing NFOs'}
          actionIcon={<FileCode2 className="w-3.5 h-3.5" />}
          onAction={issues.missingMovieNfo.length + issues.missingEpisodeNfo.length > 0 ? fixMissingNfos : undefined}
        >
          {issues.missingMovieNfo.map((m) => (
            <button
              key={`mn-${m.id}`}
              onClick={() => onOpenMovie?.(m.id, 'nfo')}
              className="block w-full text-left text-xs text-slate-300 hover:text-sky-300 cursor-pointer"
            >
              Movie: {m.title}
            </button>
          ))}
          {issues.missingEpisodeNfo.map((e) => (
            <button
              key={`en-${e.id}`}
              onClick={() => onOpenEpisode?.(e.showId, e.id, 'nfo')}
              className="block w-full text-left text-xs text-slate-300 hover:text-sky-300 cursor-pointer"
            >
              {e.showTitle} {e.code} — {e.title}
            </button>
          ))}
        </AuditSection>

        <AuditSection
          title={`Missing Preferred Subtitles (${issues.missingSubtitles.length})`}
          emptyText="All items have subtitles in your preferred languages."
          actionLabel={busy === 'subs' ? 'Downloading...' : 'Download Missing Subs'}
          actionIcon={<Languages className="w-3.5 h-3.5" />}
          onAction={issues.missingSubtitles.length > 0 ? fixMissingSubs : undefined}
        >
          {issues.missingSubtitles.slice(0, 12).map((s, idx) => (
            <button
              key={idx}
              onClick={() => {
                if (s.mediaType === 'movie') onOpenMovie?.(s.id, 'subtitles');
                else if (s.showId) onOpenEpisode?.(s.showId, s.id, 'subtitles');
              }}
              className="w-full text-left text-xs text-slate-300 hover:text-sky-300 flex justify-between cursor-pointer"
            >
              <span>{s.title}</span>
              <span className="text-amber-300 font-mono uppercase">{s.missingLanguages.join(', ')}</span>
            </button>
          ))}
        </AuditSection>

        <AuditSection
          title={`Missing Kodi Artwork (${issues.missingArtwork.length})`}
          emptyText="All movies & shows have posters, fanart, and logos."
        >
          {issues.missingArtwork.map((a, i) => (
            <button
              key={i}
              onClick={() => {
                if (a.mediaType === 'movie') onOpenMovie?.(a.id, 'artwork');
                else onOpenShow?.(a.id, 'artwork');
              }}
              className="w-full text-left text-xs text-slate-300 hover:text-sky-300 flex justify-between gap-2 cursor-pointer"
            >
              <span>{a.title}</span>
              <span className="text-rose-300 font-mono">{a.missing.join(', ')}</span>
            </button>
          ))}
        </AuditSection>

        <AuditSection
          title={`Duplicate Media (${issues.duplicateMovies.length + issues.duplicateEpisodes.length})`}
          emptyText="No duplicate movies or episodes detected."
        >
          {issues.duplicateMovies.map((d) => (
            <div key={d.key} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                <Copy className="w-3.5 h-3.5" /> {d.reason} ({d.items.length} files)
              </div>
              <div className="space-y-1.5">
                {d.items.map((item) => {
                  const isDeleting = pendingDelete?.kind === 'movie' && pendingDelete.id === item.id;
                  const isEditingEdition = editionMovieId === item.id;
                  return (
                    <div key={item.id} className="p-2 rounded bg-slate-950/70 border border-slate-800/80 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <button
                          onClick={() => onOpenMovie?.(item.id)}
                          className="min-w-0 flex-1 text-left text-[11px] font-mono text-slate-300 hover:text-sky-300 truncate cursor-pointer"
                        >
                          <span className="px-1.5 py-0.5 rounded bg-slate-800 text-sky-300 mr-1.5">{item.resolution || 'SD'}</span>
                          {item.filePath}
                        </button>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditionMovieId(isEditingEdition ? null : item.id);
                              setEditionInput('');
                            }}
                            title="Tag distinct edition (e.g. Director's Cut) to resolve duplicate"
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-semibold text-amber-300 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Tag className="w-3 h-3" /> Edition
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete({ kind: 'movie', id: item.id, deleteFiles: false })}
                            className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 cursor-pointer"
                          >
                            Remove DB
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete({ kind: 'movie', id: item.id, deleteFiles: true })}
                            className="px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 text-[10px] font-semibold text-rose-300 inline-flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" /> Delete Files
                          </button>
                        </div>
                      </div>

                      {isEditingEdition && (
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-800">
                          <input
                            value={editionInput}
                            onChange={(e) => setEditionInput(e.target.value)}
                            placeholder="e.g. Director's Cut"
                            className="flex-1 min-w-[140px] bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[11px] text-slate-100"
                          />
                          {["Director's Cut", 'Extended Edition', '4K Remaster'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => void handleTagEdition(item.id, preset)}
                              className="px-1.5 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 cursor-pointer"
                            >
                              {preset}
                            </button>
                          ))}
                          <button
                            type="button"
                            disabled={!editionInput.trim()}
                            onClick={() => void handleTagEdition(item.id, editionInput)}
                            className="px-2 py-1 rounded bg-sky-600 hover:bg-sky-500 disabled:opacity-40 text-white text-[10px] font-bold cursor-pointer"
                          >
                            Save
                          </button>
                        </div>
                      )}

                      {isDeleting && (
                        <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-rose-500/15 border border-rose-500/35">
                          <span className="text-[11px] text-rose-200 font-semibold">
                            {pendingDelete.deleteFiles ? 'Permanently delete file + sidecars?' : 'Remove entry from database?'}
                          </span>
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => void handleConfirmDelete()}
                              className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              onClick={() => setPendingDelete(null)}
                              className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}

          {issues.duplicateEpisodes.map((d) => (
            <div key={d.key} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                <Copy className="w-3.5 h-3.5" /> {d.showTitle} S{String(d.season).padStart(2, '0')}E
                {String(d.episode).padStart(2, '0')} ({d.items.length} files)
              </div>
              {d.items.map((item) => {
                const isDeleting = pendingDelete?.kind === 'episode' && pendingDelete.id === item.id;
                return (
                  <div key={item.id} className="p-1.5 rounded bg-slate-950/70 border border-slate-800/80 space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-mono text-slate-300 truncate">{item.filePath}</span>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPendingDelete({ kind: 'episode', id: item.id, deleteFiles: false })}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 cursor-pointer"
                        >
                          Remove DB
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingDelete({ kind: 'episode', id: item.id, deleteFiles: true })}
                          className="px-2 py-0.5 rounded bg-rose-500/15 hover:bg-rose-500/25 text-[10px] font-semibold text-rose-300 cursor-pointer"
                        >
                          Delete Files
                        </button>
                      </div>
                    </div>
                    {isDeleting && (
                      <div className="flex items-center justify-between gap-2 px-2 py-1 rounded bg-rose-500/15 border border-rose-500/35">
                        <span className="text-[11px] text-rose-200 font-semibold">
                          {pendingDelete.deleteFiles ? 'Delete episode file + sidecars?' : 'Remove episode from DB?'}
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => void handleConfirmDelete()}
                            className="px-2 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold cursor-pointer"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => setPendingDelete(null)}
                            className="px-2 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </AuditSection>

        <AuditSection
          title={`Missing Aired Episodes (${(issues.missingEpisodes ?? []).length})`}
          emptyText="All scraped series have every aired episode in their episode guide."
        >
          {[...missingByShow.entries()].map(([showId, grp]) => (
            <div key={showId} className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={() => onOpenShow?.(showId)}
                  className="text-xs font-bold text-white hover:text-sky-300 flex items-center gap-1.5 cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5 text-amber-400" />
                  {grp.showTitle}
                </button>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-bold">
                  {grp.items.length} missing
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {grp.items.map((m) => (
                  <button
                    key={m.code}
                    onClick={() => onOpenShow?.(showId)}
                    title={`${m.title}${m.aired ? ` (${m.aired})` : ''}`}
                    className="px-2 py-0.5 rounded bg-slate-950 border border-slate-800 hover:border-amber-500/40 text-[11px] font-mono text-amber-200 cursor-pointer"
                  >
                    {m.code} · {m.title}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </AuditSection>

        <AuditSection
          title={`Low Resolution (<1080p) & NFO Warnings (${issues.lowResolutionItems.length + issues.invalidNfoFiles.length})`}
          emptyText="All media meets 1080p+ quality and passes Kodi schema checks."
        >
          {issues.lowResolutionItems.map((l) => (
            <button
              key={`lr-${l.id}`}
              onClick={() => onOpenMovie?.(l.id)}
              className="w-full text-left text-xs text-slate-300 hover:text-sky-300 flex justify-between cursor-pointer"
            >
              <span>{l.title}</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px]">{l.resolution}</span>
            </button>
          ))}
          {issues.invalidNfoFiles.map((n) => (
            <button
              key={`inv-${n.mediaType}-${n.id}`}
              onClick={() => {
                if (n.mediaType === 'movie') onOpenMovie?.(n.id, 'nfo');
                else if (n.mediaType === 'tvshow') onOpenShow?.(n.id, 'nfo');
                else if (n.showId) onOpenEpisode?.(n.showId, n.id, 'nfo');
              }}
              className="w-full text-left text-xs text-amber-200 hover:text-sky-300 flex items-center gap-1.5 cursor-pointer"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{n.title}: {n.warnings.join('; ')}</span>
            </button>
          ))}
        </AuditSection>
      </div>
    </div>
  );
};

const AuditSection: React.FC<{
  title: string;
  emptyText: string;
  actionLabel?: string;
  actionIcon?: React.ReactNode;
  onAction?: () => void;
  children: React.ReactNode;
}> = ({ title, emptyText, actionLabel, actionIcon, onAction, children }) => {
  const hasChildren = React.Children.toArray(children).some(Boolean);
  return (
    <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        {onAction && actionLabel && (
          <button
            onClick={onAction}
            className="px-2.5 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 text-[11px] font-bold flex items-center gap-1 cursor-pointer"
          >
            {actionIcon}
            {actionLabel}
          </button>
        )}
      </div>
      {!hasChildren ? (
        <div className="text-xs text-emerald-400/90 flex items-center gap-1.5 py-2">
          <CheckCircle2 className="w-4 h-4" /> {emptyText}
        </div>
      ) : (
        <div className="space-y-2 max-h-56 overflow-y-auto pr-1">{children}</div>
      )}
    </div>
  );
};
