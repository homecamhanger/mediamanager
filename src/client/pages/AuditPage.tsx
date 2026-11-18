import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Copy,
  FileCode2,
  FolderInput,
  Languages,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Tag,
  Trash2,
} from 'lucide-react';
import type {
  LibraryAuditReport,
  MediaSource,
  MissingEpisodeRecord,
  MovieProblemReport,
} from '../../shared/types.js';
import { api } from '../lib/api.js';
import type { AuditProgress } from '../../shared/types.js';
import type { InspectorFocusTab } from '../lib/workspaceTypes.js';
import { PathText } from '../components/PathText.js';
import { ProgressBar } from '../components/ProgressBar.js';

/**
 * Problem kinds a rescan can act on.
 *
 * `unscraped` is deliberately absent: it is not a disk problem and has its own action
 * in the Unscraped section. `low-resolution` is absent too — nothing a rescan reads
 * will change a file's resolution.
 */
const RESCANNABLE_KINDS = [
  'missing-artwork',
  'missing-nfo',
  'invalid-nfo',
  'no-own-folder',
] as const;

type RescannableKind = (typeof RESCANNABLE_KINDS)[number];

const KIND_LABELS: Record<string, string> = {
  'missing-artwork': 'No artwork',
  'missing-nfo': 'No NFO',
  'invalid-nfo': 'Bad NFO',
  'no-own-folder': 'No own folder',
  unscraped: 'Unscraped',
  'low-resolution': 'Low res',
};

export const AuditPage: React.FC<{
  onRefresh: () => void;
  /** Source roots, so paths can be shortened from the left for display. */
  sources?: MediaSource[];
  onOpenMovie?: (movieId: number, focusTab?: InspectorFocusTab) => void;
  onOpenShow?: (showId: number, focusTab?: InspectorFocusTab) => void;
  onOpenEpisode?: (showId: number, episodeId: number, focusTab?: InspectorFocusTab) => void;
}> = ({ onRefresh, sources = [], onOpenMovie, onOpenShow, onOpenEpisode }) => {
  const [audit, setAudit] = useState<LibraryAuditReport | null>(null);
  const [problems, setProblems] = useState<MovieProblemReport | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  // Which problem kinds are in scope, and which specific films are ticked. Kinds start
  // all-on because that is the common intent; films start all-on for the same reason,
  // and either can be narrowed.
  const [enabledKinds, setEnabledKinds] = useState<Set<RescannableKind>>(
    () => new Set(RESCANNABLE_KINDS),
  );
  const [deselectedMovies, setDeselectedMovies] = useState<Set<number>>(new Set());
  // Type checkboxes for the rescan, mirroring the scrape panel: a mixed library should
  // not force films and series to be rescanned together.
  const [rescanTypes, setRescanTypes] = useState<{ movies: boolean; shows: boolean }>({
    movies: true,
    shows: true,
  });
  const [deselectedShows, setDeselectedShows] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [editionMovieId, setEditionMovieId] = useState<number | null>(null);
  const [editionInput, setEditionInput] = useState('');
  const [pendingDelete, setPendingDelete] = useState<{
    kind: 'movie' | 'episode';
    id: number;
    deleteFiles: boolean;
  } | null>(null);

  const [progress, setProgress] = useState<AuditProgress | null>(null);
  // Scrape selection. Movies and shows are separately selectable because scraping a
  // whole TV library is far slower than a film library, and a bad match on one type
  // should not stop the other from being fixed. Item-level deselection rides on top.
  const [scrapeTypes, setScrapeTypes] = useState<{ movies: boolean; shows: boolean }>({
    movies: true,
    shows: true,
  });
  const [deselectedScrapeMovies, setDeselectedScrapeMovies] = useState<Set<number>>(new Set());
  const [deselectedScrapeShows, setDeselectedScrapeShows] = useState<Set<number>>(new Set());
  const [batchProgress, setBatchProgress] = useState<{ phase: string; percent: number } | null>(null);

  /**
   * Runs the audit as a pollable job so the page can show which stage it is on.
   *
   * The audit used to be one blocking request whose only states were "spinning" and
   * "done" — the complaint being that you could not tell a slow audit from a hung one.
   * Now the server reports each phase with real counts, and this polls it.
   */
  const load = async () => {
    try {
      const { job } = await api.runAudit();
      let current = job;
      setProgress(current.progress);
      while (current.status === 'running') {
        await new Promise((r) => setTimeout(r, 250));
        const polled = await api.getAuditJob(current.jobId);
        current = polled.job;
        setProgress(current.progress);
      }
      if (current.status === 'failed') throw new Error(current.error ?? 'Audit failed');
      if (current.report) setAudit(current.report);
      setProgress(null);
    } catch (err) {
      setProgress(null);
      setStatusMsg(err instanceof Error ? err.message : 'Audit failed');
      return;
    }
    // The problem report is the same analysis the rescan acts on, so fetching it after
    // the audit keeps the buttons and the list in agreement.
    const p = await api.getMovieProblems().catch(() => null);
    setProblems(p);
  };

  useEffect(() => {
    void load();
  }, []);

  if (!audit) {
    return (
      <div className="space-y-3 p-8">
        <div className="text-sm text-slate-400">Auditing library health...</div>
        {progress && (
          <ProgressBar
            phase={progress.phase}
            percent={progress.percent}
            completed={progress.completed}
            total={progress.total}
          />
        )}
      </div>
    );
  }

  const { summary, issues } = audit;

  /**
   * Items in scope, given the enabled problem kinds.
   *
   * An item is in scope when it has at least one enabled problem that a rescan can act
   * on. Ticking "No artwork" therefore stops an NFO-only item from being dragged along.
   * The per-type checkbox gates the group on top of that, so unticking "TV Shows" is
   * enough to keep a whole media type out of the run.
   */
  const rescanSelectedMovies = rescanTypes.movies
    ? (problems?.movies ?? []).filter(
        (m) =>
          m.rescanCanFix &&
          m.problems.some(
            (kind) =>
              enabledKinds.has(kind as RescannableKind) &&
              RESCANNABLE_KINDS.includes(kind as RescannableKind),
          ),
      )
    : [];
  const rescanSelectedShows = rescanTypes.shows
    ? (problems?.shows ?? []).filter(
        (sh) =>
          sh.rescanCanFix &&
          sh.problems.some(
            (kind) =>
              enabledKinds.has(kind as RescannableKind) &&
              RESCANNABLE_KINDS.includes(kind as RescannableKind),
          ),
      )
    : [];

  /** Ticked items. This is exactly what the button will send. */
  const selectedMovieIds = rescanSelectedMovies
    .map((m) => m.movieId)
    .filter((id) => !deselectedMovies.has(id));
  const selectedShowIds = rescanSelectedShows
    .map((sh) => sh.showId)
    .filter((id) => !deselectedShows.has(id));

  const rescanTotalCount = rescanSelectedMovies.length + rescanSelectedShows.length;
  const rescanSelectedCount = selectedMovieIds.length + selectedShowIds.length;

  const toggleKind = (kind: RescannableKind) => {
    setEnabledKinds((prev) => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const toggleMovie = (movieId: number) => {
    setDeselectedMovies((prev) => {
      const next = new Set(prev);
      if (next.has(movieId)) next.delete(movieId);
      else next.add(movieId);
      return next;
    });
  };

  const toggleShow = (showId: number) => {
    setDeselectedShows((prev) => {
      const next = new Set(prev);
      if (next.has(showId)) next.delete(showId);
      else next.add(showId);
      return next;
    });
  };

  /**
   * How many unscraped items the scrape button would act on.
   *
   * Ticked items are tracked by deselection, so a newly-scraped-then-unscraped item
   * reappears ticked rather than hidden by stale positive state.
   */
  const unscrapedSelectedCount =
    (scrapeTypes.movies
      ? issues.unscrapedMovies.filter((m) => !deselectedScrapeMovies.has(m.id)).length
      : 0) +
    (scrapeTypes.shows
      ? issues.unscrapedShows.filter((s) => !deselectedScrapeShows.has(s.id)).length
      : 0);

  /**
   * Re-reads the ticked items from disk.
   *
   * The selection is sent explicitly rather than as "all", so what runs is what was
   * ticked on screen — the one thing a per-item checkbox has to guarantee.
   */
  const rescanProblems = async () => {
    if (selectedMovieIds.length === 0 && selectedShowIds.length === 0) return;
    setBusy('rescan');
    try {
      const res = await api.rescanProblems({ movieIds: selectedMovieIds, showIds: selectedShowIds });
      const parts: string[] = [];
      if (res.movieIds.length > 0) parts.push(`${res.movieIds.length} film${res.movieIds.length === 1 ? '' : 's'}`);
      if (res.showIds.length > 0) parts.push(`${res.showIds.length} series`);
      setStatusMsg(`Rescanning ${parts.join(' + ')} — progress in the status strip`);
      await load();
      onRefresh();
    } catch (err) {
      setStatusMsg((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  /**
   * Scrapes the ticked unscraped items.
   *
   * Sends explicit ids rather than `onlyUnscraped` so unticking a single film or a whole
   * type actually means something; the server batch endpoint already accepts id lists.
   * The loop is chunked with a running count because a big TV scrape is slow enough that
   * a bare "Scraping..." label was indistinguishable from a stall.
   */
  const fixUnscraped = async () => {
    const movieIds = (audit?.issues.unscrapedMovies ?? [])
      .map((m) => m.id)
      .filter((id) => !deselectedScrapeMovies.has(id));
    const showIds = (audit?.issues.unscrapedShows ?? [])
      .map((s) => s.id)
      .filter((id) => !deselectedScrapeShows.has(id));
    const targets: { kind: 'movies' | 'shows'; ids: number[] }[] = [];
    if (scrapeTypes.movies && movieIds.length > 0) targets.push({ kind: 'movies', ids: movieIds });
    if (scrapeTypes.shows && showIds.length > 0) targets.push({ kind: 'shows', ids: showIds });
    if (targets.length === 0) {
      setStatusMsg('Nothing selected to scrape.');
      return;
    }

    setBusy('scrape');
    const total = targets.reduce((n, t) => n + t.ids.length, 0);
    let done = 0;
    try {
      for (const target of targets) {
        for (const id of target.ids) {
          setBatchProgress({
            phase: `Scraping ${target.kind === 'movies' ? 'film' : 'series'} (${done + 1}/${total})`,
            percent: Math.round((done / total) * 100),
          });
          await api.batchScrape(
            target.kind === 'movies' ? { movieIds: [id] } : { showIds: [id] },
          );
          done += 1;
        }
      }
      setBatchProgress({ phase: 'Refreshing audit', percent: 100 });
      await load();
      onRefresh();
    } catch (err) {
      setStatusMsg((err as Error).message);
    } finally {
      setBusy(null);
      setBatchProgress(null);
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

      {statusMsg && (
        <div className="px-3 py-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-[11px] text-sky-200 flex items-center justify-between gap-3">
          <span>{statusMsg}</span>
          <button
            type="button"
            onClick={() => setStatusMsg(null)}
            className="text-slate-400 hover:text-slate-100 cursor-pointer shrink-0"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {/*
          Rescan only, by design.

          This panel used to offer a scrape button as well, which duplicated the
          Unscraped section below and left two places doing the same job. Scraping
          lives there; this is purely "re-read these items from disk".

          It mirrors the Unscraped section's controls on purpose: a type checkbox per
          media type, then per-item checkboxes inside each group. Two panels that look
          the same behave the same, which is the whole point of having both.
        */}
        <AuditSection
          title={`Rescan Problem Items (${rescanSelectedCount}/${rescanTotalCount} selected)`}
          emptyText="Nothing needs re-reading from disk."
          actionLabel={
            busy === 'rescan' ? 'Rescanning...' : `Rescan Selected (${rescanSelectedCount})`
          }
          actionIcon={
            busy === 'rescan' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />
          }
          onAction={rescanSelectedCount > 0 && busy !== 'rescan' ? () => void rescanProblems() : undefined}
          headerExtra={
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200">
                <input
                  type="checkbox"
                  className="accent-sky-500"
                  checked={rescanTypes.movies}
                  onChange={(e) => setRescanTypes((t) => ({ ...t, movies: e.target.checked }))}
                />
                Movies
              </label>
              <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200">
                <input
                  type="checkbox"
                  className="accent-sky-500"
                  checked={rescanTypes.shows}
                  onChange={(e) => setRescanTypes((t) => ({ ...t, shows: e.target.checked }))}
                />
                TV Shows
              </label>
            </div>
          }
        >
          {problems && rescanTotalCount > 0 ? (
            <div className="space-y-2">
              {/* Problem kinds still narrow the list, but they no longer replace it. */}
              <div className="flex flex-wrap items-center gap-1.5">
                {RESCANNABLE_KINDS.map((kind) => {
                  const available = problems.summary.byKind[kind] ?? 0;
                  const checked = enabledKinds.has(kind);
                  return (
                    <label
                      key={kind}
                      className={`px-1.5 py-0.5 rounded border text-[10px] font-semibold flex items-center gap-1 ${
                        available === 0
                          ? 'border-slate-800 text-slate-600 cursor-not-allowed'
                          : checked
                            ? 'border-sky-500/50 bg-sky-500/15 text-sky-200 cursor-pointer'
                            : 'border-slate-700 text-slate-400 cursor-pointer'
                      }`}
                      title={
                        available === 0
                          ? 'No items have this problem'
                          : `Include items flagged for ${KIND_LABELS[kind]}`
                      }
                    >
                      <input
                        type="checkbox"
                        checked={checked && available > 0}
                        disabled={available === 0}
                        onChange={() => toggleKind(kind)}
                        className="accent-sky-500 cursor-pointer disabled:cursor-not-allowed"
                      />
                      {KIND_LABELS[kind]} ({available})
                    </label>
                  );
                })}
              </div>

              {rescanSelectedMovies.length > 0 && (
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500 pt-1">
                  <span>
                    Movies ({rescanSelectedMovies.filter((m) => !deselectedMovies.has(m.movieId)).length}/
                    {rescanSelectedMovies.length})
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="normal-case font-normal text-sky-400 hover:text-sky-300 cursor-pointer"
                      onClick={() => setDeselectedMovies(new Set())}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className="normal-case font-normal text-sky-400 hover:text-sky-300 cursor-pointer"
                      onClick={() => setDeselectedMovies(new Set(rescanSelectedMovies.map((m) => m.movieId)))}
                    >
                      None
                    </button>
                  </span>
                </div>
              )}
              {rescanSelectedMovies.map((m) => (
                <div key={`rm-${m.movieId}`} className="py-0.5 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={!deselectedMovies.has(m.movieId)}
                    onChange={() => toggleMovie(m.movieId)}
                    className="mt-1 accent-sky-500 cursor-pointer shrink-0"
                    title="Include this film in the rescan"
                  />
                  <button
                    type="button"
                    onClick={() => onOpenMovie?.(m.movieId)}
                    className="min-w-0 flex-1 text-left cursor-pointer hover:bg-white/5"
                  >
                    <span className="text-xs font-semibold text-white block truncate">
                      {m.title}
                      {m.year ? <span className="text-slate-500 font-normal"> ({m.year})</span> : null}
                    </span>
                    <span className="flex flex-wrap gap-1 mt-0.5">
                      {m.problems.map((kind) => (
                        <span
                          key={kind}
                          className={`px-1 py-0 rounded text-[9px] font-semibold border ${
                            kind === 'no-own-folder'
                              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                              : 'bg-slate-700/40 text-slate-300 border-slate-600/50'
                          }`}
                        >
                          {KIND_LABELS[kind] ?? kind}
                        </span>
                      ))}
                      {m.needsScrape && (
                        <span
                          className="px-1 py-0 rounded text-[9px] font-semibold border bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                          title="A rescan cannot add metadata that was never scraped — use Auto-Scrape"
                        >
                          + scrape
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              ))}

              {rescanSelectedShows.length > 0 && (
                <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500 pt-1">
                  <span>
                    TV Shows ({rescanSelectedShows.filter((s) => !deselectedShows.has(s.showId)).length}/
                    {rescanSelectedShows.length})
                  </span>
                  <span className="flex gap-2">
                    <button
                      type="button"
                      className="normal-case font-normal text-sky-400 hover:text-sky-300 cursor-pointer"
                      onClick={() => setDeselectedShows(new Set())}
                    >
                      All
                    </button>
                    <button
                      type="button"
                      className="normal-case font-normal text-sky-400 hover:text-sky-300 cursor-pointer"
                      onClick={() => setDeselectedShows(new Set(rescanSelectedShows.map((s) => s.showId)))}
                    >
                      None
                    </button>
                  </span>
                </div>
              )}
              {rescanSelectedShows.map((sh) => (
                <div key={`rs-${sh.showId}`} className="py-0.5 flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={!deselectedShows.has(sh.showId)}
                    onChange={() => toggleShow(sh.showId)}
                    className="mt-1 accent-sky-500 cursor-pointer shrink-0"
                    title="Include this series in the rescan"
                  />
                  <button
                    type="button"
                    onClick={() => onOpenShow?.(sh.showId)}
                    className="min-w-0 flex-1 text-left cursor-pointer hover:bg-white/5"
                  >
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="text-xs font-semibold text-white truncate">
                        {sh.title}
                        {sh.year ? <span className="text-slate-500 font-normal"> ({sh.year})</span> : null}
                      </span>
                      <PathText
                        path={sh.folderPath}
                        sources={sources}
                        className="font-mono text-[10px] text-slate-500 truncate max-w-[40%] shrink-0"
                      />
                    </span>
                    <span className="flex flex-wrap gap-1 mt-0.5">
                      {sh.problems.map((kind) => (
                        <span
                          key={kind}
                          className="px-1 py-0 rounded text-[9px] font-semibold border bg-slate-700/40 text-slate-300 border-slate-600/50"
                        >
                          {KIND_LABELS[kind] ?? kind}
                        </span>
                      ))}
                      {sh.needsScrape && (
                        <span
                          className="px-1 py-0 rounded text-[9px] font-semibold border bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                          title="A rescan cannot add metadata that was never scraped — use Auto-Scrape"
                        >
                          + scrape
                        </span>
                      )}
                    </span>
                  </button>
                </div>
              ))}

              {problems.summary.byKind['no-own-folder'] > 0 && (
                <p className="text-[11px] text-amber-300 inline-flex items-center gap-1 pt-1">
                  <FolderInput className="w-3 h-3" />
                  {problems.summary.byKind['no-own-folder']} without their own folder — see the Renamer
                </p>
              )}

              <p className="text-[10px] leading-relaxed text-slate-500">
                A rescan re-reads files already on disk: artwork, NFO XML and sidecars. It cannot
                add metadata that was never scraped — items marked{' '}
                <span className="text-indigo-300/80">+ scrape</span> also need the Auto-Scrape
                action in the Unscraped section below.
              </p>
            </div>
          ) : null}
        </AuditSection>

        <AuditSection
          title={`Unscraped Items (${unscrapedSelectedCount}/${issues.unscrapedMovies.length + issues.unscrapedShows.length} selected)`}
          emptyText="Every movie and TV show has been scraped!"
          actionLabel={busy === 'scrape' ? 'Scraping...' : `Auto-Scrape Selected (${unscrapedSelectedCount})`}
          actionIcon={<Sparkles className="w-3.5 h-3.5" />}
          onAction={unscrapedSelectedCount > 0 && busy !== 'scrape' ? fixUnscraped : undefined}
          headerExtra={
            <div className="flex items-center gap-2 text-[11px] text-slate-400">
              <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200">
                <input
                  type="checkbox"
                  className="accent-sky-500"
                  checked={scrapeTypes.movies}
                  onChange={(e) => setScrapeTypes((t) => ({ ...t, movies: e.target.checked }))}
                />
                Movies
              </label>
              <label className="flex items-center gap-1 cursor-pointer hover:text-slate-200">
                <input
                  type="checkbox"
                  className="accent-sky-500"
                  checked={scrapeTypes.shows}
                  onChange={(e) => setScrapeTypes((t) => ({ ...t, shows: e.target.checked }))}
                />
                TV Shows
              </label>
            </div>
          }
        >
          {batchProgress && (
            <ProgressBar phase={batchProgress.phase} percent={batchProgress.percent} />
          )}
          {issues.unscrapedMovies.length > 0 && (
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500">
              <span>Movies ({issues.unscrapedMovies.filter((m) => !deselectedScrapeMovies.has(m.id)).length}/{issues.unscrapedMovies.length})</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="normal-case font-normal text-sky-400 hover:text-sky-300 cursor-pointer"
                  onClick={() => setDeselectedScrapeMovies(new Set())}
                >
                  All
                </button>
                <button
                  type="button"
                  className="normal-case font-normal text-sky-400 hover:text-sky-300 cursor-pointer"
                  onClick={() => setDeselectedScrapeMovies(new Set(issues.unscrapedMovies.map((m) => m.id)))}
                >
                  None
                </button>
              </span>
            </div>
          )}
          {issues.unscrapedMovies.map((m) => (
            <div
              key={`m-${m.id}`}
              className="w-full text-xs text-slate-300 flex items-center gap-2 hover:text-sky-300"
            >
              <input
                type="checkbox"
                className="accent-sky-500 shrink-0"
                checked={!deselectedScrapeMovies.has(m.id)}
                onChange={(e) =>
                  setDeselectedScrapeMovies((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.delete(m.id);
                    else next.add(m.id);
                    return next;
                  })
                }
              />
              <button
                onClick={() => onOpenMovie?.(m.id)}
                className="flex-1 min-w-0 text-left flex justify-between gap-2 cursor-pointer"
              >
                <span className="font-semibold text-white">Movie: {m.title}</span>
                <PathText
                  path={m.filePath}
                  sources={sources}
                  className="font-mono text-[11px] text-slate-500 truncate max-w-xs"
                />
              </button>
            </div>
          ))}
          {issues.unscrapedShows.length > 0 && (
            <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wide text-slate-500 pt-1">
              <span>TV Shows ({issues.unscrapedShows.filter((s) => !deselectedScrapeShows.has(s.id)).length}/{issues.unscrapedShows.length})</span>
              <span className="flex gap-2">
                <button
                  type="button"
                  className="normal-case font-normal text-sky-400 hover:text-sky-300 cursor-pointer"
                  onClick={() => setDeselectedScrapeShows(new Set())}
                >
                  All
                </button>
                <button
                  type="button"
                  className="normal-case font-normal text-sky-400 hover:text-sky-300 cursor-pointer"
                  onClick={() => setDeselectedScrapeShows(new Set(issues.unscrapedShows.map((s) => s.id)))}
                >
                  None
                </button>
              </span>
            </div>
          )}
          {issues.unscrapedShows.map((s) => (
            <div
              key={`s-${s.id}`}
              className="w-full text-xs text-slate-300 flex items-center gap-2 hover:text-sky-300"
            >
              <input
                type="checkbox"
                className="accent-sky-500 shrink-0"
                checked={!deselectedScrapeShows.has(s.id)}
                onChange={(e) =>
                  setDeselectedScrapeShows((prev) => {
                    const next = new Set(prev);
                    if (e.target.checked) next.delete(s.id);
                    else next.add(s.id);
                    return next;
                  })
                }
              />
              <button
                onClick={() => onOpenShow?.(s.id)}
                className="flex-1 min-w-0 text-left flex justify-between gap-2 cursor-pointer"
              >
                <span className="font-semibold text-white">TV Show: {s.title}</span>
                <PathText
                  path={s.folderPath}
                  sources={sources}
                  className="font-mono text-[11px] text-slate-500 truncate max-w-xs"
                />
              </button>
            </div>
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
                          <PathText path={item.filePath} sources={sources} />
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
                      <PathText
                        path={item.filePath}
                        sources={sources}
                        className="text-[11px] font-mono text-slate-300 truncate"
                      />
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
  /** Extra controls shown next to the action button (select-all, counts). */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
}> = ({ title, emptyText, actionLabel, actionIcon, onAction, headerExtra, children }) => {
  const hasChildren = React.Children.toArray(children).some(Boolean);
  return (
    <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-bold text-white">{title}</h3>
        <div className="flex items-center gap-2">
        {headerExtra}
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
