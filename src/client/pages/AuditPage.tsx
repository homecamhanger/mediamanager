import React, { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Copy, FileCode2, Languages, ShieldAlert, Sparkles } from 'lucide-react';
import type { LibraryAuditReport } from '../../shared/types.js';
import { api } from '../lib/api.js';

export const AuditPage: React.FC<{
  onRefresh: () => void;
  onOpenMovie?: (movieId: number) => void;
  onOpenShow?: (showId: number) => void;
}> = ({ onRefresh, onOpenMovie, onOpenShow }) => {
  const [audit, setAudit] = useState<LibraryAuditReport | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

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
              onClick={() => onOpenMovie?.(m.id)}
              className="block w-full text-left text-xs text-slate-300 hover:text-sky-300 cursor-pointer"
            >
              Movie: {m.title}
            </button>
          ))}
          {issues.missingEpisodeNfo.map((e) => (
            <div key={`en-${e.id}`} className="text-xs text-slate-300">
              {e.showTitle} {e.code} — {e.title}
            </div>
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
            <div key={idx} className="text-xs text-slate-300 flex justify-between">
              <span>{s.title}</span>
              <span className="text-amber-300 font-mono uppercase">{s.missingLanguages.join(', ')}</span>
            </div>
          ))}
        </AuditSection>

        <AuditSection
          title={`Missing Kodi Artwork (${issues.missingArtwork.length})`}
          emptyText="All movies & shows have posters, fanart, and logos."
        >
          {issues.missingArtwork.map((a, i) => (
            <div key={i} className="text-xs text-slate-300 flex justify-between gap-2">
              <span>{a.title}</span>
              <span className="text-rose-300 font-mono">{a.missing.join(', ')}</span>
            </div>
          ))}
        </AuditSection>

        <AuditSection
          title={`Duplicate Media (${issues.duplicateMovies.length + issues.duplicateEpisodes.length})`}
          emptyText="No duplicate movies or episodes detected."
        >
          {issues.duplicateMovies.map((d) => (
            <div key={d.key} className="p-2 rounded-lg bg-slate-900 border border-slate-800 space-y-1">
              <div className="text-xs font-semibold text-amber-300 flex items-center gap-1">
                <Copy className="w-3.5 h-3.5" /> {d.reason}
              </div>
              {d.items.map((item) => (
                <div key={item.id} className="text-[11px] font-mono text-slate-400 truncate">
                  [{item.resolution}] {item.filePath}
                </div>
              ))}
            </div>
          ))}
        </AuditSection>

        <AuditSection
          title={`Low Resolution (<1080p) & NFO Warnings (${issues.lowResolutionItems.length + issues.invalidNfoFiles.length})`}
          emptyText="All media meets 1080p+ quality and passes Kodi schema checks."
        >
          {issues.lowResolutionItems.map((l) => (
            <div key={`lr-${l.id}`} className="text-xs text-slate-300 flex justify-between">
              <span>{l.title}</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 font-mono text-[10px]">{l.resolution}</span>
            </div>
          ))}
          {issues.invalidNfoFiles.map((n) => (
            <div key={`inv-${n.mediaType}-${n.id}`} className="text-xs text-amber-200 flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>{n.title}: {n.warnings.join('; ')}</span>
            </div>
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
