import fs from 'node:fs';
import path from 'node:path';
import type { ArtworkKind, MediaSource, SubtitleFileRecord } from '../../shared/types.js';
import { MediaDatabase } from '../db/database.js';
import {
  parseEpisodeNfoXml,
  parseMovieNfoXml,
  parseTvShowNfoXml,
  validateKodiNfoXml,
} from '../nfo/kodiNfo.js';
import { computeOpenSubtitlesHash } from '../subtitles/openSubtitlesHash.js';
import { isSubtitleFile, parseSubtitleContent, parseSubtitleFilename } from '../subtitles/subtitleTools.js';
import { extractTitleAndYear, isSampleOrExtraFile, isVideoFile, parseMediaFilename } from './filenameParser.js';
import { probeMediaFile } from './mediaProbe.js';

const ARTWORK_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp'];

export class LibraryScanner {
  constructor(private db: MediaDatabase) {}

  async scanAllSources(): Promise<{ moviesScanned: number; showsScanned: number; episodesScanned: number }> {
    const sources = this.db.listSources();
    let moviesScanned = 0;
    let showsScanned = 0;
    let episodesScanned = 0;

    for (const s of sources) {
      const res = await this.scanSource(s);
      moviesScanned += res.moviesScanned;
      showsScanned += res.showsScanned;
      episodesScanned += res.episodesScanned;
    }
    return { moviesScanned, showsScanned, episodesScanned };
  }

  async scanSource(source: MediaSource): Promise<{ moviesScanned: number; showsScanned: number; episodesScanned: number }> {
    if (!fs.existsSync(source.path)) {
      this.db.logActivity('scan', 'Scan Source', `Source path missing: ${source.path}`, 'warning');
      return { moviesScanned: 0, showsScanned: 0, episodesScanned: 0 };
    }

    if (source.mediaKind === 'movie') {
      const count = await this.scanMovieSource(source);
      this.db.updateSourceScanned(source.id);
      this.db.logActivity('scan', 'Scan Movies', `Scanned ${count} movies in "${source.name}"`, 'success');
      return { moviesScanned: count, showsScanned: 0, episodesScanned: 0 };
    } else {
      const res = await this.scanTvShowSource(source);
      this.db.updateSourceScanned(source.id);
      this.db.logActivity(
        'scan',
        'Scan TV Shows',
        `Scanned ${res.shows} shows and ${res.episodes} episodes in "${source.name}"`,
        'success'
      );
      return { moviesScanned: 0, showsScanned: res.shows, episodesScanned: res.episodes };
    }
  }

  private async scanMovieSource(source: MediaSource): Promise<number> {
    const videoFiles = walkVideoFiles(source.path);
    const seenPaths = new Set<string>();

    for (const videoPath of videoFiles) {
      seenPaths.add(videoPath);
      const stat = fs.statSync(videoPath);
      const folderPath = path.dirname(videoPath);
      const ext = path.extname(videoPath);
      const base = path.basename(videoPath, ext);
      const parsedInfo = parseMediaFilename(videoPath, 'movie');
      const movieHash = computeOpenSubtitlesHash(videoPath);

      // Locate NFO (<filename>.nfo or movie.nfo in same folder if not source root)
      const baseNfo = path.join(folderPath, `${base}.nfo`);
      const folderNfo = folderPath !== source.path ? path.join(folderPath, 'movie.nfo') : '';
      let nfoPath: string | null = null;
      if (fs.existsSync(baseNfo)) nfoPath = baseNfo;
      else if (folderNfo && fs.existsSync(folderNfo)) nfoPath = folderNfo;

      let nfoData = null;
      let nfoValid = false;
      let nfoWarnings: string[] = [];
      if (nfoPath) {
        const xml = fs.readFileSync(nfoPath, 'utf-8');
        nfoData = parseMovieNfoXml(xml);
        const report = validateKodiNfoXml(xml);
        nfoValid = report.valid;
        nfoWarnings = [...report.errors, ...report.warnings];
      }

      const streamDetails = nfoData?.streamDetails ?? (await probeMediaFile(videoPath, parsedInfo));
      const artwork = discoverMovieArtwork(folderPath, base, folderPath !== source.path);

      let setId: number | null = null;
      if (nfoData?.setName) {
        setId = this.db.upsertMovieSet(nfoData.setName, nfoData.setOverview ?? '');
      }

      const scraped = Boolean(
        nfoData &&
          ((nfoData.uniqueIds && Object.keys(nfoData.uniqueIds).length > 0) ||
            (nfoData.plot && nfoData.plot.length > 10))
      );

      const saved = this.db.upsertMovie({
        sourceId: source.id,
        folderPath,
        filePath: videoPath,
        fileName: path.basename(videoPath),
        fileSizeBytes: stat.size,
        movieHash,
        nfoPath,
        hasNfo: Boolean(nfoPath),
        nfoValid,
        nfoWarnings,
        scraped,
        scrapedSource: scraped ? 'nfo' : null,
        title: nfoData?.title || parsedInfo.cleanTitle || base,
        originalTitle: nfoData?.originalTitle || '',
        sortTitle: nfoData?.sortTitle || nfoData?.title || parsedInfo.cleanTitle || base,
        year: nfoData?.year ?? parsedInfo.year,
        premiered: nfoData?.premiered ?? null,
        tagline: nfoData?.tagline || '',
        plot: nfoData?.plot || '',
        outline: nfoData?.outline || '',
        runtimeMinutes:
          nfoData?.runtimeMinutes ??
          (streamDetails.video[0]?.durationSeconds ? Math.round(streamDetails.video[0].durationSeconds / 60) : null),
        mpaa: nfoData?.mpaa || '',
        country: nfoData?.country || '',
        studios: nfoData?.studios ?? [],
        genres: nfoData?.genres ?? [],
        tags: nfoData?.tags ?? [],
        directors: nfoData?.directors ?? [],
        writers: nfoData?.writers ?? [],
        actors: nfoData?.actors ?? [],
        trailerUrl: nfoData?.trailerUrl || '',
        setId,
        uniqueIds: nfoData?.uniqueIds ?? {},
        ratings: nfoData?.ratings ?? [],
        userRating: nfoData?.userRating ?? null,
        playCount: nfoData?.playCount ?? 0,
        watched: nfoData?.watched ?? false,
        lastPlayed: nfoData?.lastPlayed ?? null,
        dateAdded: nfoData?.dateAdded || stat.mtime.toISOString(),
        artwork,
        artworkCandidates: {},
        streamDetails,
        parsedInfo,
        updatedAt: new Date().toISOString(),
      });

      const subs = discoverSidecarSubtitles('movie', saved.id, folderPath, base);
      this.db.replaceSubtitlesForMedia('movie', saved.id, subs);
    }

    // Remove stale DB movie entries whose video files were deleted outside app
    for (const existing of this.db.listMovies().filter((m) => m.sourceId === source.id)) {
      if (!seenPaths.has(existing.filePath)) {
        this.db.deleteMovie(existing.id);
      }
    }

    return videoFiles.length;
  }

  private async scanTvShowSource(source: MediaSource): Promise<{ shows: number; episodes: number }> {
    const entries = fs.readdirSync(source.path, { withFileTypes: true }).filter((d) => d.isDirectory());
    let showsCount = 0;
    let episodesCount = 0;

    for (const showDirEntry of entries) {
      const showFolder = path.join(source.path, showDirEntry.name);
      const showNfoPath = path.join(showFolder, 'tvshow.nfo');
      const hasShowNfo = fs.existsSync(showNfoPath);

      let nfoData = null;
      let nfoValid = false;
      let nfoWarnings: string[] = [];
      if (hasShowNfo) {
        const xml = fs.readFileSync(showNfoPath, 'utf-8');
        nfoData = parseTvShowNfoXml(xml);
        const report = validateKodiNfoXml(xml);
        nfoValid = report.valid;
        nfoWarnings = [...report.errors, ...report.warnings];
      }

      const folderParsed = extractTitleAndYear(showDirEntry.name);
      const showArtwork = discoverShowArtwork(showFolder);
      const scraped = Boolean(nfoData && ((nfoData.uniqueIds && Object.keys(nfoData.uniqueIds).length > 0) || nfoData.plot));

      const showRecord = this.db.upsertTvShow({
        sourceId: source.id,
        folderPath: showFolder,
        nfoPath: hasShowNfo ? showNfoPath : null,
        hasNfo: hasShowNfo,
        nfoValid,
        nfoWarnings,
        scraped,
        scrapedSource: scraped ? 'nfo' : null,
        title: nfoData?.title || folderParsed.title || showDirEntry.name,
        originalTitle: nfoData?.originalTitle || '',
        sortTitle: nfoData?.sortTitle || nfoData?.title || folderParsed.title || showDirEntry.name,
        year: nfoData?.year ?? folderParsed.year,
        premiered: nfoData?.premiered ?? null,
        status: nfoData?.status || 'Continuing',
        plot: nfoData?.plot || '',
        mpaa: nfoData?.mpaa || '',
        studio: nfoData?.studio || '',
        genres: nfoData?.genres ?? [],
        tags: nfoData?.tags ?? [],
        actors: nfoData?.actors ?? [],
        episodeOrder: 'aired',
        uniqueIds: nfoData?.uniqueIds ?? {},
        ratings: nfoData?.ratings ?? [],
        userRating: nfoData?.userRating ?? null,
        dateAdded: new Date().toISOString(),
        artwork: showArtwork,
        updatedAt: new Date().toISOString(),
      });
      showsCount++;

      // Scan video files inside showFolder
      const epFiles = walkVideoFiles(showFolder);
      const seasonNumbers = new Set<number>();

      for (const epPath of epFiles) {
        const stat = fs.statSync(epPath);
        const epDir = path.dirname(epPath);
        const ext = path.extname(epPath);
        const base = path.basename(epPath, ext);
        const parsed = parseMediaFilename(epPath, 'tvshow');
        const epHash = computeOpenSubtitlesHash(epPath);

        // Determine season from filename or parent folder name
        let seasonNum = parsed.seasonNumber;
        if (seasonNum === null) {
          const parentName = path.basename(epDir);
          const sm = parentName.match(/season\s*(\d{1,2})/i);
          if (sm) seasonNum = Number(sm[1]);
          else if (/specials/i.test(parentName)) seasonNum = 0;
          else seasonNum = 1;
        }
        const episodeNum = parsed.episodeNumber ?? 1;
        seasonNumbers.add(seasonNum);

        // Ensure season row exists
        const seasonFolder = epDir !== showFolder ? epDir : null;
        const seasonPoster = findSeasonArtwork(showFolder, seasonNum, 'poster');
        const seasonBanner = findSeasonArtwork(showFolder, seasonNum, 'banner');
        const seasonNfo = seasonFolder && fs.existsSync(path.join(seasonFolder, 'season.nfo'))
          ? path.join(seasonFolder, 'season.nfo')
          : null;
        this.db.upsertTvSeason({
          showId: showRecord.id,
          seasonNumber: seasonNum,
          name: seasonNum === 0 ? 'Specials' : `Season ${seasonNum}`,
          overview: '',
          folderPath: seasonFolder,
          nfoPath: seasonNfo,
          hasNfo: Boolean(seasonNfo),
          posterPath: seasonPoster,
          bannerPath: seasonBanner,
        });

        const epNfoPath = path.join(epDir, `${base}.nfo`);
        const hasEpNfo = fs.existsSync(epNfoPath);
        let epNfoList = [] as ReturnType<typeof parseEpisodeNfoXml>;
        let epNfoValid = false;
        let epNfoWarnings: string[] = [];
        if (hasEpNfo) {
          const xml = fs.readFileSync(epNfoPath, 'utf-8');
          epNfoList = parseEpisodeNfoXml(xml);
          const rep = validateKodiNfoXml(xml);
          epNfoValid = rep.valid;
          epNfoWarnings = [...rep.errors, ...rep.warnings];
        }
        const epNfo = epNfoList[0];
        const streamDetails = epNfo?.streamDetails ?? (await probeMediaFile(epPath, parsed));
        const thumbPath = findEpisodeThumb(epDir, base);
        const epScraped = Boolean(epNfo && (epNfo.plot || (epNfo.uniqueIds && Object.keys(epNfo.uniqueIds).length > 0)));

        const savedEp = this.db.upsertTvEpisode({
          showId: showRecord.id,
          seasonNumber: epNfo?.seasonNumber ?? seasonNum,
          episodeNumber: epNfo?.episodeNumber ?? episodeNum,
          displaySeason: epNfo?.displaySeason ?? null,
          displayEpisode: epNfo?.displayEpisode ?? null,
          multiEpisodeEnd: parsed.multiEpisodeEnd ?? (epNfoList.length > 1 ? episodeNum + epNfoList.length - 1 : null),
          folderPath: epDir,
          filePath: epPath,
          fileName: path.basename(epPath),
          fileSizeBytes: stat.size,
          movieHash: epHash,
          nfoPath: hasEpNfo ? epNfoPath : null,
          hasNfo: hasEpNfo,
          nfoValid: epNfoValid,
          nfoWarnings: epNfoWarnings,
          scraped: epScraped,
          title: epNfo?.title || parsed.cleanTitle || `Episode ${episodeNum}`,
          showTitle: epNfo?.showTitle || showRecord.title,
          aired: epNfo?.aired ?? null,
          plot: epNfo?.plot || '',
          runtimeMinutes: epNfo?.runtimeMinutes ?? 45,
          directors: epNfo?.directors ?? [],
          writers: epNfo?.writers ?? [],
          actors: epNfo?.actors ?? [],
          uniqueIds: epNfo?.uniqueIds ?? {},
          ratings: epNfo?.ratings ?? [],
          userRating: epNfo?.userRating ?? null,
          playCount: epNfo?.playCount ?? 0,
          watched: epNfo?.watched ?? false,
          lastPlayed: epNfo?.lastPlayed ?? null,
          thumbPath,
          streamDetails,
          parsedInfo: parsed,
        });

        const subs = discoverSidecarSubtitles('episode', savedEp.id, epDir, base);
        this.db.replaceSubtitlesForMedia('episode', savedEp.id, subs);
        episodesCount++;
      }
    }

    return { shows: showsCount, episodes: episodesCount };
  }
}

function walkVideoFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  const items = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    if (item.name.startsWith('.')) continue;
    const full = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (['extrafanart', 'extrathumbs', '.actors', 'subs', 'subtitles'].includes(item.name.toLowerCase())) continue;
      out.push(...walkVideoFiles(full));
    } else if (item.isFile() && isVideoFile(full) && !isSampleOrExtraFile(full)) {
      out.push(full);
    }
  }
  return out;
}

function findArtFile(dir: string, candidates: string[]): string | null {
  for (const base of candidates) {
    for (const ext of ARTWORK_EXTENSIONS) {
      const p = path.join(dir, `${base}${ext}`);
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}

function discoverMovieArtwork(dir: string, videoBase: string, isDedicatedFolder: boolean): Record<ArtworkKind, string | null> {
  const kinds: ArtworkKind[] = ['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'disc', 'landscape', 'thumb'];
  const out = {} as Record<ArtworkKind, string | null>;
  for (const kind of kinds) {
    const names = isDedicatedFolder ? [`${videoBase}-${kind}`, kind] : [`${videoBase}-${kind}`];
    if (kind === 'disc' && isDedicatedFolder) names.push('discart', `${videoBase}-discart`);
    out[kind] = findArtFile(dir, names);
  }
  return out;
}

function discoverShowArtwork(dir: string): Record<ArtworkKind, string | null> {
  const kinds: ArtworkKind[] = ['poster', 'fanart', 'banner', 'clearlogo', 'clearart', 'disc', 'landscape', 'thumb'];
  const out = {} as Record<ArtworkKind, string | null>;
  for (const kind of kinds) {
    out[kind] = findArtFile(dir, [kind]);
  }
  return out;
}

function findSeasonArtwork(showDir: string, seasonNum: number, kind: 'poster' | 'banner'): string | null {
  const padded = String(seasonNum).padStart(2, '0');
  const candidates =
    seasonNum === 0
      ? [`season-specials-${kind}`, `season00-${kind}`]
      : [`season${padded}-${kind}`, `Season ${seasonNum}/${kind}`];
  return findArtFile(showDir, candidates);
}

function findEpisodeThumb(epDir: string, videoBase: string): string | null {
  return findArtFile(epDir, [`${videoBase}-thumb`, videoBase]);
}

function discoverSidecarSubtitles(
  mediaType: 'movie' | 'episode',
  mediaId: number,
  dir: string,
  videoBase: string
): Array<Omit<SubtitleFileRecord, 'id'>> {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir);
  const subs: Array<Omit<SubtitleFileRecord, 'id'>> = [];

  for (const name of entries) {
    const full = path.join(dir, name);
    if (!isSubtitleFile(full)) continue;
    if (!name.startsWith(videoBase)) continue;
    const parsed = parseSubtitleFilename(full, videoBase);
    const stat = fs.statSync(full);
    let cueCount = 0;
    try {
      const content = fs.readFileSync(full, 'utf-8');
      cueCount = parseSubtitleContent(content).length;
    } catch {
      cueCount = 0;
    }
    subs.push({
      mediaType,
      mediaId,
      filePath: full,
      fileName: name,
      language: parsed.language,
      format: parsed.format,
      forced: parsed.forced,
      sdh: parsed.sdh,
      sizeBytes: stat.size,
      cueCount,
    });
  }
  return subs;
}
