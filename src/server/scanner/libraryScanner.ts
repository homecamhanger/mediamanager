import fs from 'node:fs';
import path from 'node:path';
import type {
  ArtworkKind,
  MediaSource,
  ParsedFilenameInfo,
  ScanStepId,
  ScanStepStatus,
  StreamDetails,
  SubtitleFileRecord,
} from '../../shared/types.js';
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

export interface ScanProgressUpdate {
  overallPercent?: number;
  currentItem?: string;
  itemsProcessed?: number;
  itemsTotal?: number;
  moviesScanned?: number;
  showsScanned?: number;
  episodesScanned?: number;
  stepUpdate?: {
    id: ScanStepId;
    status?: ScanStepStatus;
    completedCount?: number;
    totalCount?: number;
    detail?: string;
  };
}

export type ScanProgressReporter = (update: ScanProgressUpdate) => void;

const yieldToEventLoop = () => new Promise<void>((resolve) => setImmediate(resolve));

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

  async scanSource(
    source: MediaSource,
    onProgress?: ScanProgressReporter
  ): Promise<{ moviesScanned: number; showsScanned: number; episodesScanned: number }> {
    if (!fs.existsSync(source.path)) {
      this.db.logActivity('scan', 'Scan Source', `Source path missing: ${source.path}`, 'warning');
      if (onProgress) {
        throw new Error(`Source path does not exist: ${source.path}`);
      }
      return { moviesScanned: 0, showsScanned: 0, episodesScanned: 0 };
    }

    onProgress?.({
      overallPercent: 8,
      stepUpdate: { id: 'register_source', status: 'completed', detail: `Validated "${source.path}"` },
    });

    if (source.mediaKind === 'movie') {
      const count = await this.scanMovieSource(source, onProgress);
      onProgress?.({
        overallPercent: 95,
        stepUpdate: { id: 'finalize', status: 'in_progress', detail: 'Updating source timestamp & activity log' },
      });
      this.db.updateSourceScanned(source.id);
      this.db.logActivity('scan', 'Scan Movies', `Scanned ${count} movies in "${source.name}"`, 'success');
      onProgress?.({
        overallPercent: 100,
        moviesScanned: count,
        stepUpdate: {
          id: 'finalize',
          status: 'completed',
          detail: `Indexed ${count} movie${count === 1 ? '' : 's'}`,
        },
      });
      return { moviesScanned: count, showsScanned: 0, episodesScanned: 0 };
    }

    const res = await this.scanTvShowSource(source, onProgress);
    onProgress?.({
      overallPercent: 95,
      stepUpdate: { id: 'finalize', status: 'in_progress', detail: 'Updating source timestamp & activity log' },
    });
    this.db.updateSourceScanned(source.id);
    this.db.logActivity(
      'scan',
      'Scan TV Shows',
      `Scanned ${res.shows} shows and ${res.episodes} episodes in "${source.name}"`,
      'success'
    );
    onProgress?.({
      overallPercent: 100,
      showsScanned: res.shows,
      episodesScanned: res.episodes,
      stepUpdate: {
        id: 'finalize',
        status: 'completed',
        detail: `Indexed ${res.shows} show${res.shows === 1 ? '' : 's'} and ${res.episodes} episode${res.episodes === 1 ? '' : 's'}`,
      },
    });
    return { moviesScanned: 0, showsScanned: res.shows, episodesScanned: res.episodes };
  }

  private async scanMovieSource(source: MediaSource, onProgress?: ScanProgressReporter): Promise<number> {
    // Step 2: Discover files
    onProgress?.({
      overallPercent: 12,
      currentItem: source.path,
      stepUpdate: { id: 'discover_files', status: 'in_progress', detail: 'Walking directories for movie files...' },
    });
    if (onProgress) await yieldToEventLoop();

    const videoFiles = walkVideoFiles(source.path);
    const total = videoFiles.length;
    onProgress?.({
      overallPercent: 20,
      itemsTotal: total,
      itemsProcessed: 0,
      stepUpdate: {
        id: 'discover_files',
        status: 'completed',
        completedCount: total,
        totalCount: total,
        detail: `Found ${total} movie file${total === 1 ? '' : 's'}`,
      },
    });

    // Step 3: Probe streams & compute OpenSubtitles hashes
    interface ProbedMovieItem {
      videoPath: string;
      stat: fs.Stats;
      folderPath: string;
      base: string;
      parsedInfo: ParsedFilenameInfo;
      movieHash: string;
      streamDetails: StreamDetails;
      nfoPath: string | null;
      nfoXml: string | null;
    }

    const probedItems: ProbedMovieItem[] = [];
    onProgress?.({
      overallPercent: 20,
      stepUpdate: {
        id: 'probe_and_hash',
        status: 'in_progress',
        completedCount: 0,
        totalCount: total,
        detail: total === 0 ? 'No video files to probe' : 'Inspecting video containers & computing hashes...',
      },
    });

    for (let i = 0; i < total; i++) {
      const videoPath = videoFiles[i];
      const fileName = path.basename(videoPath);
      const stat = fs.statSync(videoPath);
      const folderPath = path.dirname(videoPath);
      const ext = path.extname(videoPath);
      const base = path.basename(videoPath, ext);
      const parsedInfo = parseMediaFilename(videoPath, 'movie');
      const movieHash = computeOpenSubtitlesHash(videoPath);

      const baseNfo = path.join(folderPath, `${base}.nfo`);
      const folderNfo = folderPath !== source.path ? path.join(folderPath, 'movie.nfo') : '';
      let nfoPath: string | null = null;
      if (fs.existsSync(baseNfo)) nfoPath = baseNfo;
      else if (folderNfo && fs.existsSync(folderNfo)) nfoPath = folderNfo;

      let nfoXml: string | null = null;
      let parsedStreamFromNfo: StreamDetails | null | undefined;
      if (nfoPath) {
        nfoXml = fs.readFileSync(nfoPath, 'utf-8');
        parsedStreamFromNfo = parseMovieNfoXml(nfoXml)?.streamDetails;
      }
      const streamDetails = parsedStreamFromNfo ?? (await probeMediaFile(videoPath, parsedInfo));

      probedItems.push({
        videoPath,
        stat,
        folderPath,
        base,
        parsedInfo,
        movieHash,
        streamDetails,
        nfoPath,
        nfoXml,
      });

      onProgress?.({
        overallPercent: 20 + Math.round(((i + 1) / Math.max(1, total)) * 38),
        currentItem: fileName,
        itemsProcessed: i + 1,
        itemsTotal: total,
        stepUpdate: {
          id: 'probe_and_hash',
          status: 'in_progress',
          completedCount: i + 1,
          totalCount: total,
          detail: fileName,
        },
      });
      if (onProgress) await yieldToEventLoop();
    }

    onProgress?.({
      overallPercent: 58,
      stepUpdate: {
        id: 'probe_and_hash',
        status: 'completed',
        completedCount: total,
        totalCount: total,
        detail: total === 0 ? 'No video files to probe' : `Probed ${total} file${total === 1 ? '' : 's'}`,
      },
    });

    // Step 4: Index NFOs, artwork & subtitles and persist to SQLite
    onProgress?.({
      overallPercent: 60,
      stepUpdate: {
        id: 'parse_sidecars',
        status: 'in_progress',
        completedCount: 0,
        totalCount: total,
        detail: total === 0 ? 'No sidecars to index' : 'Parsing NFOs, artwork & subtitles...',
      },
    });

    const seenPaths = new Set<string>();
    for (let i = 0; i < probedItems.length; i++) {
      const item = probedItems[i];
      seenPaths.add(item.videoPath);

      let nfoData = null;
      let nfoValid = false;
      let nfoWarnings: string[] = [];
      if (item.nfoXml) {
        nfoData = parseMovieNfoXml(item.nfoXml);
        const report = validateKodiNfoXml(item.nfoXml);
        nfoValid = report.valid;
        nfoWarnings = [...report.errors, ...report.warnings];
      }

      const artwork = discoverMovieArtwork(item.folderPath, item.base, item.folderPath !== source.path);

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
        folderPath: item.folderPath,
        filePath: item.videoPath,
        fileName: path.basename(item.videoPath),
        fileSizeBytes: item.stat.size,
        movieHash: item.movieHash,
        nfoPath: item.nfoPath,
        hasNfo: Boolean(item.nfoPath),
        nfoValid,
        nfoWarnings,
        scraped,
        scrapedSource: scraped ? 'nfo' : null,
        title: nfoData?.title || item.parsedInfo.cleanTitle || item.base,
        originalTitle: nfoData?.originalTitle || '',
        sortTitle: nfoData?.sortTitle || nfoData?.title || item.parsedInfo.cleanTitle || item.base,
        year: nfoData?.year ?? item.parsedInfo.year,
        premiered: nfoData?.premiered ?? null,
        tagline: nfoData?.tagline || '',
        plot: nfoData?.plot || '',
        outline: nfoData?.outline || '',
        runtimeMinutes:
          nfoData?.runtimeMinutes ??
          (item.streamDetails.video[0]?.durationSeconds
            ? Math.round(item.streamDetails.video[0].durationSeconds / 60)
            : null),
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
        dateAdded: nfoData?.dateAdded || item.stat.mtime.toISOString(),
        artwork,
        artworkCandidates: {},
        streamDetails: item.streamDetails,
        parsedInfo: item.parsedInfo,
        updatedAt: new Date().toISOString(),
      });

      const subs = discoverSidecarSubtitles('movie', saved.id, item.folderPath, item.base);
      this.db.replaceSubtitlesForMedia('movie', saved.id, subs);

      onProgress?.({
        overallPercent: 60 + Math.round(((i + 1) / Math.max(1, total)) * 34),
        currentItem: saved.title,
        itemsProcessed: i + 1,
        itemsTotal: total,
        moviesScanned: i + 1,
        stepUpdate: {
          id: 'parse_sidecars',
          status: 'in_progress',
          completedCount: i + 1,
          totalCount: total,
          detail: saved.title,
        },
      });
      if (onProgress) await yieldToEventLoop();
    }

    onProgress?.({
      overallPercent: 94,
      stepUpdate: {
        id: 'parse_sidecars',
        status: 'completed',
        completedCount: total,
        totalCount: total,
        detail: total === 0 ? 'No sidecars to index' : `Indexed ${total} movie record${total === 1 ? '' : 's'}`,
      },
    });

    // Remove stale DB movie entries whose video files were deleted outside app
    for (const existing of this.db.listMovies().filter((m) => m.sourceId === source.id)) {
      if (!seenPaths.has(existing.filePath)) {
        this.db.deleteMovie(existing.id);
      }
    }

    return videoFiles.length;
  }

  private async scanTvShowSource(
    source: MediaSource,
    onProgress?: ScanProgressReporter
  ): Promise<{ shows: number; episodes: number }> {
    // Step 2: Discover show folders & episode video files
    onProgress?.({
      overallPercent: 12,
      currentItem: source.path,
      stepUpdate: { id: 'discover_files', status: 'in_progress', detail: 'Scanning series folders & episodes...' },
    });
    if (onProgress) await yieldToEventLoop();

    const entries = fs.readdirSync(source.path, { withFileTypes: true }).filter((d) => d.isDirectory());
    const discoveredShows: Array<{ showDirName: string; showFolder: string; epFiles: string[] }> = [];
    let totalEpisodes = 0;

    for (const showDirEntry of entries) {
      const showFolder = path.join(source.path, showDirEntry.name);
      const epFiles = walkVideoFiles(showFolder);
      discoveredShows.push({ showDirName: showDirEntry.name, showFolder, epFiles });
      totalEpisodes += epFiles.length;
    }

    onProgress?.({
      overallPercent: 20,
      itemsTotal: totalEpisodes,
      itemsProcessed: 0,
      stepUpdate: {
        id: 'discover_files',
        status: 'completed',
        completedCount: totalEpisodes,
        totalCount: totalEpisodes,
        detail: `Found ${discoveredShows.length} series folder${discoveredShows.length === 1 ? '' : 's'}, ${totalEpisodes} episode${totalEpisodes === 1 ? '' : 's'}`,
      },
    });

    // Step 3: Probe streams & compute hashes for every episode
    interface ProbedEpisodeItem {
      showIdx: number;
      epPath: string;
      epDir: string;
      base: string;
      stat: fs.Stats;
      parsed: ParsedFilenameInfo;
      epHash: string;
      epNfoPath: string | null;
      epNfoXml: string | null;
      streamDetails: StreamDetails;
    }

    const probedByShow = new Map<number, ProbedEpisodeItem[]>();
    onProgress?.({
      overallPercent: 20,
      stepUpdate: {
        id: 'probe_and_hash',
        status: 'in_progress',
        completedCount: 0,
        totalCount: totalEpisodes,
        detail: totalEpisodes === 0 ? 'No episodes to probe' : 'Inspecting episode streams & computing hashes...',
      },
    });

    let probedCount = 0;
    for (let sIdx = 0; sIdx < discoveredShows.length; sIdx++) {
      const showItem = discoveredShows[sIdx];
      const epList: ProbedEpisodeItem[] = [];
      for (const epPath of showItem.epFiles) {
        const stat = fs.statSync(epPath);
        const epDir = path.dirname(epPath);
        const ext = path.extname(epPath);
        const base = path.basename(epPath, ext);
        const parsed = parseMediaFilename(epPath, 'tvshow');
        const epHash = computeOpenSubtitlesHash(epPath);

        const epNfoPathCandidate = path.join(epDir, `${base}.nfo`);
        const epNfoPath = fs.existsSync(epNfoPathCandidate) ? epNfoPathCandidate : null;
        let epNfoXml: string | null = null;
        let parsedStream: StreamDetails | null | undefined;
        if (epNfoPath) {
          epNfoXml = fs.readFileSync(epNfoPath, 'utf-8');
          parsedStream = parseEpisodeNfoXml(epNfoXml)[0]?.streamDetails;
        }
        const streamDetails = parsedStream ?? (await probeMediaFile(epPath, parsed));

        epList.push({
          showIdx: sIdx,
          epPath,
          epDir,
          base,
          stat,
          parsed,
          epHash,
          epNfoPath,
          epNfoXml,
          streamDetails,
        });

        probedCount++;
        onProgress?.({
          overallPercent: 20 + Math.round((probedCount / Math.max(1, totalEpisodes)) * 38),
          currentItem: path.basename(epPath),
          itemsProcessed: probedCount,
          itemsTotal: totalEpisodes,
          stepUpdate: {
            id: 'probe_and_hash',
            status: 'in_progress',
            completedCount: probedCount,
            totalCount: totalEpisodes,
            detail: path.basename(epPath),
          },
        });
        if (onProgress) await yieldToEventLoop();
      }
      probedByShow.set(sIdx, epList);
    }

    onProgress?.({
      overallPercent: 58,
      stepUpdate: {
        id: 'probe_and_hash',
        status: 'completed',
        completedCount: totalEpisodes,
        totalCount: totalEpisodes,
        detail: totalEpisodes === 0 ? 'No episodes to probe' : `Probed ${totalEpisodes} episode${totalEpisodes === 1 ? '' : 's'}`,
      },
    });

    // Step 4: Index NFOs, artwork & subtitles for shows, seasons & episodes
    const totalSidecarUnits = Math.max(discoveredShows.length, totalEpisodes);
    onProgress?.({
      overallPercent: 60,
      stepUpdate: {
        id: 'parse_sidecars',
        status: 'in_progress',
        completedCount: 0,
        totalCount: totalSidecarUnits,
        detail: totalSidecarUnits === 0 ? 'No sidecars to index' : 'Parsing tvshow/episode NFOs, artwork & subtitles...',
      },
    });

    let showsCount = 0;
    let episodesCount = 0;

    for (let sIdx = 0; sIdx < discoveredShows.length; sIdx++) {
      const { showDirName, showFolder } = discoveredShows[sIdx];
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

      const folderParsed = extractTitleAndYear(showDirName);
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
        title: nfoData?.title || folderParsed.title || showDirName,
        originalTitle: nfoData?.originalTitle || '',
        sortTitle: nfoData?.sortTitle || nfoData?.title || folderParsed.title || showDirName,
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

      const epItems = probedByShow.get(sIdx) ?? [];
      for (const epItem of epItems) {
        let seasonNum = epItem.parsed.seasonNumber;
        if (seasonNum === null) {
          const parentName = path.basename(epItem.epDir);
          const sm = parentName.match(/season\s*(\d{1,2})/i);
          if (sm) seasonNum = Number(sm[1]);
          else if (/specials/i.test(parentName)) seasonNum = 0;
          else seasonNum = 1;
        }
        const episodeNum = epItem.parsed.episodeNumber ?? 1;

        const seasonFolder = epItem.epDir !== showFolder ? epItem.epDir : null;
        const seasonPoster = findSeasonArtwork(showFolder, seasonNum, 'poster');
        const seasonBanner = findSeasonArtwork(showFolder, seasonNum, 'banner');
        const seasonNfo =
          seasonFolder && fs.existsSync(path.join(seasonFolder, 'season.nfo'))
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

        let epNfoList = [] as ReturnType<typeof parseEpisodeNfoXml>;
        let epNfoValid = false;
        let epNfoWarnings: string[] = [];
        if (epItem.epNfoXml) {
          epNfoList = parseEpisodeNfoXml(epItem.epNfoXml);
          const rep = validateKodiNfoXml(epItem.epNfoXml);
          epNfoValid = rep.valid;
          epNfoWarnings = [...rep.errors, ...rep.warnings];
        }
        const epNfo = epNfoList[0];
        const thumbPath = findEpisodeThumb(epItem.epDir, epItem.base);
        const epScraped = Boolean(epNfo && (epNfo.plot || (epNfo.uniqueIds && Object.keys(epNfo.uniqueIds).length > 0)));

        const savedEp = this.db.upsertTvEpisode({
          showId: showRecord.id,
          seasonNumber: epNfo?.seasonNumber ?? seasonNum,
          episodeNumber: epNfo?.episodeNumber ?? episodeNum,
          displaySeason: epNfo?.displaySeason ?? null,
          displayEpisode: epNfo?.displayEpisode ?? null,
          multiEpisodeEnd: epItem.parsed.multiEpisodeEnd ?? (epNfoList.length > 1 ? episodeNum + epNfoList.length - 1 : null),
          folderPath: epItem.epDir,
          filePath: epItem.epPath,
          fileName: path.basename(epItem.epPath),
          fileSizeBytes: epItem.stat.size,
          movieHash: epItem.epHash,
          nfoPath: epItem.epNfoPath,
          hasNfo: Boolean(epItem.epNfoPath),
          nfoValid: epNfoValid,
          nfoWarnings: epNfoWarnings,
          scraped: epScraped,
          title: epNfo?.title || epItem.parsed.cleanTitle || `Episode ${episodeNum}`,
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
          streamDetails: epItem.streamDetails,
          parsedInfo: epItem.parsed,
        });

        const subs = discoverSidecarSubtitles('episode', savedEp.id, epItem.epDir, epItem.base);
        this.db.replaceSubtitlesForMedia('episode', savedEp.id, subs);
        episodesCount++;

        onProgress?.({
          overallPercent: 60 + Math.round((episodesCount / Math.max(1, totalSidecarUnits)) * 34),
          currentItem: `${showRecord.title} • S${String(savedEp.seasonNumber).padStart(2, '0')}E${String(savedEp.episodeNumber).padStart(2, '0')}`,
          itemsProcessed: episodesCount,
          itemsTotal: totalSidecarUnits,
          showsScanned: showsCount,
          episodesScanned: episodesCount,
          stepUpdate: {
            id: 'parse_sidecars',
            status: 'in_progress',
            completedCount: episodesCount,
            totalCount: totalSidecarUnits,
            detail: `${showRecord.title} (${savedEp.fileName})`,
          },
        });
        if (onProgress) await yieldToEventLoop();
      }

      if (epItems.length === 0) {
        onProgress?.({
          overallPercent: 60 + Math.round((showsCount / Math.max(1, totalSidecarUnits)) * 34),
          currentItem: showRecord.title,
          itemsProcessed: showsCount,
          itemsTotal: totalSidecarUnits,
          showsScanned: showsCount,
          stepUpdate: {
            id: 'parse_sidecars',
            status: 'in_progress',
            completedCount: showsCount,
            totalCount: totalSidecarUnits,
            detail: showRecord.title,
          },
        });
        if (onProgress) await yieldToEventLoop();
      }
    }

    onProgress?.({
      overallPercent: 94,
      stepUpdate: {
        id: 'parse_sidecars',
        status: 'completed',
        completedCount: totalSidecarUnits,
        totalCount: totalSidecarUnits,
        detail: `Indexed ${showsCount} show${showsCount === 1 ? '' : 's'} & ${episodesCount} episode${episodesCount === 1 ? '' : 's'}`,
      },
    });

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
