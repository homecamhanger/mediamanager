import type {
  ArtworkKind,
  LibraryAuditReport,
  MissingEpisodeRecord,
  MovieRecord,
} from '../../shared/types.js';
import { computeMissingEpisodesFromGuide, DEFAULT_PREFERENCES, MediaDatabase } from '../db/database.js';

/** A stage of the audit, reported as it is reached. */
export interface AuditProgress {
  phase: string;
  completed: number;
  total: number;
  percent: number;
}

export type AuditProgressReporter = (update: AuditProgress) => void;

/**
 * Builds the audit report.
 *
 * `onProgress` fires between phases. The audit is query- and CPU-bound, and on a large
 * library it ran long enough that the UI looked hung. Reporting a phase name plus real
 * counts — not a timer — is what lets the client say which stage it is on rather than
 * showing an indistinguishable spinner.
 *
 * Phases are ordered by cost, with the per-show episode-guide walk last because it is
 * the N+1 part: when the audit is slow, that is almost always where it is, and saying so
 * is the most useful thing the indicator can do.
 */
export function buildAuditReport(
  db: MediaDatabase,
  onProgress?: AuditProgressReporter,
): LibraryAuditReport {
  // Five reported phases plus the episode-guide walk, which reports its own progress.
  const total = 6;
  let done = 0;
  const step = (phase: string, advance = 1) => {
    done = Math.min(total, done + advance);
    onProgress?.({ phase, completed: done, total, percent: Math.round((done / total) * 100) });
  };

  step('Loading library');
  const prefs = db.getSetting('preferences', DEFAULT_PREFERENCES);
  const prefSubLangs = prefs.preferredSubtitleLanguages.length > 0 ? prefs.preferredSubtitleLanguages : ['en'];

  const movies = db.listMovies();
  const shows = db.listTvShows();
  const episodes = db.listAllEpisodes();
  const sets = db.listMovieSets();
  const subs = db.listAllSubtitles();
  step('Checking metadata');

  const unscrapedMovies = movies.filter((m) => !m.scraped).map((m) => ({ id: m.id, title: m.title, filePath: m.filePath }));
  const unscrapedShows = shows.filter((s) => !s.scraped).map((s) => ({ id: s.id, title: s.title, folderPath: s.folderPath }));
  const missingMovieNfo = movies.filter((m) => !m.hasNfo).map((m) => ({ id: m.id, title: m.title, filePath: m.filePath }));
  const missingEpisodeNfo = episodes
    .filter((e) => !e.hasNfo)
    .map((e) => ({
      id: e.id,
      showId: e.showId,
      showTitle: e.showTitle || 'Series',
      code: `S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`,
      title: e.title,
    }));

  const missingArtwork: LibraryAuditReport['issues']['missingArtwork'] = [];
  for (const m of movies) {
    const missing = (['poster', 'fanart', 'clearlogo'] as ArtworkKind[]).filter((k) => !m.artwork[k]);
    if (missing.length > 0) missingArtwork.push({ mediaType: 'movie', id: m.id, title: m.title, missing });
  }
  for (const s of shows) {
    const missing = (['poster', 'fanart', 'banner'] as ArtworkKind[]).filter((k) => !s.artwork[k]);
    if (missing.length > 0) missingArtwork.push({ mediaType: 'tvshow', id: s.id, title: s.title, missing });
  }

  const missingSubtitles: LibraryAuditReport['issues']['missingSubtitles'] = [];
  for (const m of movies) {
    const have = new Set(m.subtitles.map((s) => s.language));
    const missingLanguages = prefSubLangs.filter((l) => !have.has(l));
    if (missingLanguages.length > 0) missingSubtitles.push({ mediaType: 'movie', id: m.id, title: m.title, missingLanguages });
  }
  for (const e of episodes) {
    const have = new Set(e.subtitles.map((s) => s.language));
    const missingLanguages = prefSubLangs.filter((l) => !have.has(l));
    if (missingLanguages.length > 0) {
      missingSubtitles.push({
        mediaType: 'episode',
        id: e.id,
        showId: e.showId,
        title: `${e.showTitle || 'Series'} S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')}`,
        missingLanguages,
      });
    }
  }

  // Duplicate Movies (by IMDb ID or normalized title + year, keeping distinct tagged editions separate)
  const movieGroups = new Map<string, { reason: string; items: MovieRecord[] }>();
  for (const m of movies) {
    const editionSuffix = m.parsedInfo.edition?.trim()
      ? `::edition:${m.parsedInfo.edition.trim().toLowerCase()}`
      : '';
    const baseKey = m.uniqueIds.imdb
      ? `imdb:${m.uniqueIds.imdb}`
      : `title:${m.title.toLowerCase().trim()}::${m.year ?? ''}`;
    const key = `${baseKey}${editionSuffix}`;
    const reason = m.uniqueIds.imdb ? `Same IMDb ID (${m.uniqueIds.imdb})` : 'Same Title & Year';
    const g = movieGroups.get(key) ?? { reason, items: [] };
    g.items.push(m);
    movieGroups.set(key, g);
  }
  const duplicateMovies = [...movieGroups.entries()]
    .filter(([, g]) => g.items.length > 1)
    .map(([key, g]) => ({
      key,
      reason: g.reason,
      items: g.items.map((m) => ({
        id: m.id,
        title: m.title,
        year: m.year,
        filePath: m.filePath,
        resolution: m.parsedInfo.resolution ?? `${m.streamDetails.video[0]?.height ?? ''}p`,
      })),
    }));

  // Duplicate Episodes
  const epGroups = new Map<string, typeof episodes>();
  for (const e of episodes) {
    const key = `${e.showId}:S${e.seasonNumber}E${e.episodeNumber}`;
    const list = epGroups.get(key) ?? [];
    list.push(e);
    epGroups.set(key, list);
  }
  const duplicateEpisodes = [...epGroups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([key, list]) => ({
      key,
      showTitle: list[0].showTitle || 'Series',
      season: list[0].seasonNumber,
      episode: list[0].episodeNumber,
      items: list.map((e) => ({ id: e.id, title: e.title, filePath: e.filePath })),
    }));

  step('Checking NFO validity');

  const invalidNfoFiles: LibraryAuditReport['issues']['invalidNfoFiles'] = [
    ...movies
      .filter((m) => m.hasNfo && (!m.nfoValid || m.nfoWarnings.length > 0))
      .map((m) => ({
        mediaType: 'movie' as const,
        id: m.id,
        title: m.title,
        warnings: m.nfoWarnings.length > 0 ? m.nfoWarnings : ['Invalid NFO XML'],
      })),
    ...shows
      .filter((s) => s.hasNfo && (!s.nfoValid || s.nfoWarnings.length > 0))
      .map((s) => ({
        mediaType: 'tvshow' as const,
        id: s.id,
        title: s.title,
        warnings: s.nfoWarnings.length > 0 ? s.nfoWarnings : ['Invalid tvshow.nfo XML'],
      })),
    ...episodes
      .filter((e) => e.hasNfo && (!e.nfoValid || e.nfoWarnings.length > 0))
      .map((e) => ({
        mediaType: 'episode' as const,
        id: e.id,
        showId: e.showId,
        title: `${e.showTitle || 'Series'} S${String(e.seasonNumber).padStart(2, '0')}E${String(e.episodeNumber).padStart(2, '0')} — ${e.title}`,
        warnings: e.nfoWarnings.length > 0 ? e.nfoWarnings : ['Invalid episode NFO XML'],
      })),
  ];

  step('Checking video quality');

  const lowResolutionItems: LibraryAuditReport['issues']['lowResolutionItems'] = [];
  for (const m of movies) {
    const h = m.streamDetails.video[0]?.height ?? 1080;
    if (h < 1080) {
      lowResolutionItems.push({
        mediaType: 'movie',
        id: m.id,
        title: m.title,
        resolution: m.parsedInfo.resolution || `${h}p`,
        filePath: m.filePath,
      });
    }
  }

  const missingEpisodes: MissingEpisodeRecord[] = [];
  // The expensive pass: one season query plus guide computation per show. Reported as
  // it goes, so a large library shows movement rather than a stalled bar.
  for (let i = 0; i < shows.length; i++) {
    const show = shows[i];
    // Report on entry as well as every 25 shows, so a small library still names the
    // phase it is in rather than skipping straight past it.
    if (i === 0 || i % 25 === 0) {
      onProgress?.({
        phase: `Checking episode guides (${i}/${shows.length} series)`,
        completed: 4,
        total,
        // Deliberately stops short of 100: the remaining phases still have to run.
        percent: Math.round((4 / total) * 100),
      });
    }
    if (!show.episodeGuide?.length) continue;
    const showSeasons = db.listSeasonsForShow(show.id);
    const showEpisodes = episodes.filter((e) => e.showId === show.id);
    missingEpisodes.push(
      ...computeMissingEpisodesFromGuide(show.id, show.title, show.episodeGuide, showEpisodes, showSeasons)
    );
  }
  if (shows.length > 0) step('Episode guides checked', 0);

  // Compute health score (0-100)
  const totalItems = Math.max(1, movies.length + shows.length + episodes.length);
  const checks = [
    unscrapedMovies.length + unscrapedShows.length,
    missingMovieNfo.length + missingEpisodeNfo.length,
    missingArtwork.length,
    Math.round(missingSubtitles.length * 0.5),
  ];
  const penalty = checks.reduce((acc, c) => acc + c, 0);
  step('Scoring health');

  const healthScore = Math.max(12, Math.min(100, Math.round(100 - (penalty / (totalItems * 2.5)) * 100)));

  return {
    summary: {
      totalMovies: movies.length,
      totalShows: shows.length,
      totalEpisodes: episodes.length,
      totalSets: sets.length,
      totalSubtitles: subs.length,
      healthScore,
    },
    issues: {
      unscrapedMovies,
      unscrapedShows,
      missingMovieNfo,
      missingEpisodeNfo,
      missingArtwork,
      missingSubtitles,
      duplicateMovies,
      duplicateEpisodes,
      invalidNfoFiles,
      lowResolutionItems,
      missingEpisodes,
    },
  };
}
