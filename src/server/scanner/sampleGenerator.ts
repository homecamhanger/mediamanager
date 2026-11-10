import fs from 'node:fs';
import path from 'node:path';
import { MediaDatabase } from '../db/database.js';
import { ScraperEngine } from '../scrapers/scraperEngine.js';
import { SubtitleEngine } from '../subtitles/subtitleEngine.js';
import { LibraryScanner } from './libraryScanner.js';
import { createMinimalValidMp4 } from './mediaProbe.js';

export async function seedSampleLibraryIfEmpty(db: MediaDatabase, rootDir?: string) {
  if (db.listSources().length > 0) return false;
  await resetAndSeedSampleLibrary(db, rootDir);
  return true;
}

export async function resetAndSeedSampleLibrary(
  db: MediaDatabase,
  rootDir = path.resolve(process.cwd(), 'sample-library')
) {
  const moviesRoot = path.join(rootDir, 'Movies');
  const tvRoot = path.join(rootDir, 'TV Shows');
  fs.mkdirSync(moviesRoot, { recursive: true });
  fs.mkdirSync(tvRoot, { recursive: true });

  // 1. Scraped & nicely organized Kodi movies (including Movie Sets!)
  const organizedMovies = [
    {
      catalogKey: 'blade-runner-2049',
      folder: 'Blade Runner 2049 (2017) [imdbid-tt1856101]',
      file: 'Blade Runner 2049 (2017) [2160p HEVC TrueHD Atmos].mp4',
      width: 3840,
      height: 2160,
      durationSeconds: 164 * 60,
      v: 'hvc1' as const,
      a: 'ec-3' as const,
      watched: true,
      subLangs: ['en', 'es'],
    },
    {
      catalogKey: 'blade-runner-1982',
      folder: 'Blade Runner (1982) [imdbid-tt0083658]',
      file: 'Blade Runner (1982) - Final Cut [2160p HEVC DTS-HD MA].mp4',
      width: 3840,
      height: 2160,
      durationSeconds: 117 * 60,
      v: 'hvc1' as const,
      a: 'mp4a' as const,
      watched: true,
      subLangs: ['en'],
    },
    {
      catalogKey: 'dune-2021',
      folder: 'Dune (2021) [imdbid-tt1160419]',
      file: 'Dune (2021) [2160p HEVC TrueHD Atmos].mp4',
      width: 3840,
      height: 2160,
      durationSeconds: 155 * 60,
      v: 'hvc1' as const,
      a: 'ec-3' as const,
      watched: true,
      subLangs: ['en'],
    },
    {
      catalogKey: 'dune-part-two-2024',
      folder: 'Dune - Part Two (2024) [imdbid-tt15239678]',
      file: 'Dune - Part Two (2024) - IMAX [2160p HEVC TrueHD Atmos].mp4',
      width: 3840,
      height: 2160,
      durationSeconds: 166 * 60,
      v: 'hvc1' as const,
      a: 'ec-3' as const,
      watched: false,
      subLangs: ['en', 'fr'],
    },
    {
      catalogKey: 'inception-2010',
      folder: 'Inception (2010) [imdbid-tt1375666]',
      file: 'Inception (2010) [1080p H.264 DTS-HD MA].mp4',
      width: 1920,
      height: 1080,
      durationSeconds: 148 * 60,
      v: 'avc1' as const,
      a: 'mp4a' as const,
      watched: true,
      subLangs: [], // Intentionally missing subs for Audit showcase!
    },
    {
      catalogKey: 'spirited-away-2001',
      folder: 'Spirited Away (2001) [imdbid-tt0245429]',
      file: 'Spirited Away (2001) [1080p H.264 FLAC].mp4',
      width: 1920,
      height: 1080,
      durationSeconds: 125 * 60,
      v: 'avc1' as const,
      a: 'mp4a' as const,
      watched: true,
      subLangs: ['en', 'ja'],
    },
    {
      catalogKey: 'lotr-fellowship-2001',
      folder: 'The Lord of the Rings - The Fellowship of the Ring (2001)',
      file: 'The Lord of the Rings - The Fellowship of the Ring (2001) - Extended Edition [2160p HEVC].mp4',
      width: 3840,
      height: 2160,
      durationSeconds: 208 * 60,
      v: 'hvc1' as const,
      a: 'ec-3' as const,
      watched: true,
      subLangs: ['en'],
    },
  ];

  for (const m of organizedMovies) {
    const dir = path.join(moviesRoot, m.folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, m.file),
      createMinimalValidMp4({
        width: m.width,
        height: m.height,
        durationSeconds: m.durationSeconds,
        videoFourcc: m.v,
        audioFourcc: m.a,
      })
    );
  }

  // 2. Unscraped messy scene filenames ready to scrape/rename/subtitle in demo!
  const unscrapedMovies = [
    {
      folder: 'Interstellar.2014.2160p.UHD.BluRay.x265-SCENE',
      file: 'Interstellar.2014.2160p.UHD.BluRay.HEVC.TrueHD.Atmos.7.1-SCENE.mp4',
      width: 3840,
      height: 2160,
      durationSeconds: 169 * 60,
    },
    {
      folder: 'Parasite.2019.1080p.WEB-DL.DDP5.1.H264',
      file: 'Parasite.2019.1080p.WEB-DL.DDP5.1.H264-EVO.mp4',
      width: 1920,
      height: 1080,
      durationSeconds: 132 * 60,
    },
    {
      folder: 'Oppenheimer.2023.IMAX.2160p.BluRay.x265',
      file: 'Oppenheimer.2023.IMAX.2160p.BluRay.x265.mp4',
      width: 3840,
      height: 2160,
      durationSeconds: 181 * 60,
    },
    {
      folder: 'Arrival.2016.720p.BluRay.x264',
      file: 'Arrival.2016.720p.BluRay.x264.mp4',
      width: 1280,
      height: 720,
      durationSeconds: 116 * 60,
    },
  ];

  for (const u of unscrapedMovies) {
    const dir = path.join(moviesRoot, u.folder);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, u.file),
      createMinimalValidMp4({ width: u.width, height: u.height, durationSeconds: u.durationSeconds, videoFourcc: 'hvc1' })
    );
  }

  // 3. TV Shows (Severance scraped, Andor unscraped with scene names, Arcane scraped)
  const showsSeed = [
    {
      folder: 'Severance (2022) [tvdbid-371980]',
      catalogKey: 'severance',
      scrape: true,
      episodes: [
        { season: 1, file: 'Severance - S01E01 - Good News About Hell [1080p WEB-DL].mp4', subs: ['en'] },
        { season: 1, file: 'Severance - S01E02 - Half Loop [1080p WEB-DL].mp4', subs: ['en'] },
        { season: 1, file: 'Severance - S01E03 - In Perpetuity [1080p WEB-DL].mp4', subs: [] },
        { season: 1, file: 'Severance - S01E09 - The We We Are [1080p WEB-DL].mp4', subs: ['en'] },
        { season: 2, file: 'Severance - S02E01 - Hello, Ms. Cobel [2160p WEB-DL HEVC].mp4', subs: ['en'] },
      ],
    },
    {
      folder: 'Andor',
      catalogKey: 'andor',
      scrape: false, // Unscraped so user can test TV Show scraping + renaming!
      episodes: [
        { season: 1, file: 'Andor.S01E01.1080p.WEB-DL.DDP5.1.H264.mp4', subs: [] },
        { season: 1, file: 'Andor.S01E06.1080p.WEB-DL.DDP5.1.H264.mp4', subs: [] },
        { season: 1, file: 'Andor.S01E10.1080p.WEB-DL.DDP5.1.H264.mp4', subs: [] },
      ],
    },
    {
      folder: 'Arcane (2021)',
      catalogKey: 'arcane',
      scrape: true,
      episodes: [
        { season: 1, file: 'Arcane - S01E01 - Welcome to the Playground [1080p WEB-DL].mp4', subs: ['en'] },
        { season: 1, file: 'Arcane - S01E03 - The Base Violence Necessary for Change [1080p WEB-DL].mp4', subs: ['en'] },
      ],
    },
  ];

  for (const s of showsSeed) {
    for (const ep of s.episodes) {
      const seasonDir = path.join(tvRoot, s.folder, `Season ${String(ep.season).padStart(2, '0')}`);
      fs.mkdirSync(seasonDir, { recursive: true });
      fs.writeFileSync(
        path.join(seasonDir, ep.file),
        createMinimalValidMp4({ width: 1920, height: 1080, durationSeconds: 48 * 60, videoFourcc: 'avc1', audioFourcc: 'ec-3' })
      );
    }
  }

  // Register sources in DB and scan
  const movieSource = db.addSource({
    name: 'Movies Library (4K & HD)',
    path: moviesRoot,
    mediaKind: 'movie',
    nfoNaming: 'movie.nfo',
    artworkNaming: 'folder',
  });
  const tvSource = db.addSource({
    name: 'TV Series Library',
    path: tvRoot,
    mediaKind: 'tvshow',
    nfoNaming: 'movie.nfo',
    artworkNaming: 'folder',
  });

  const scanner = new LibraryScanner(db);
  await scanner.scanSource(movieSource);
  await scanner.scanSource(tvSource);

  const scraper = new ScraperEngine(db);
  const subEngine = new SubtitleEngine(db);

  // Scrape organized movies + create sample subtitles
  const allMovies = db.listMovies();
  for (const seed of organizedMovies) {
    const movie = allMovies.find((m) => m.fileName === seed.file);
    if (!movie) continue;
    const bundle = await scraper.fetchBundle({
      externalId: `catalog:${seed.catalogKey}`,
      provider: 'tmdb',
      mediaKind: 'movie',
    });
    if (bundle) {
      const updated = await scraper.applyToMovie(movie.id, bundle);
      if (updated && seed.watched) {
        db.updateMovie(updated.id, {
          watched: true,
          playCount: 1,
          lastPlayed: '2026-10-18 21:30:00',
          userRating: 9,
        });
        await scraper.writeMovieNfo(updated.id);
      }
      for (const lang of seed.subLangs) {
        const res = await subEngine.searchSubtitles({ mediaType: 'movie', mediaId: movie.id, languages: [lang] });
        if (res[0]) {
          await subEngine.downloadSubtitle({ mediaType: 'movie', mediaId: movie.id, candidate: res[0] });
        }
      }
    }
  }

  // Scrape Severance & Arcane
  const allShows = db.listTvShows();
  for (const s of showsSeed) {
    if (!s.scrape) continue;
    const show = allShows.find((sh) => sh.folderPath.endsWith(s.folder));
    if (!show) continue;
    const bundle = await scraper.fetchBundle({
      externalId: `catalog:${s.catalogKey}`,
      provider: 'tvdb',
      mediaKind: 'tvshow',
    });
    if (bundle) {
      await scraper.applyToTvShow(show.id, bundle);
      const eps = db.listEpisodesForShow(show.id);
      for (const epSeed of s.episodes) {
        const matchedEp = eps.find((e) => e.fileName === epSeed.file);
        if (!matchedEp) continue;
        for (const lang of epSeed.subs) {
          const res = await subEngine.searchSubtitles({ mediaType: 'episode', mediaId: matchedEp.id, languages: [lang] });
          if (res[0]) {
            await subEngine.downloadSubtitle({ mediaType: 'episode', mediaId: matchedEp.id, candidate: res[0] });
          }
        }
      }
    }
  }

  db.logActivity('system', 'Initialize Sample Library', 'Seeded sample Kodi library with Movies, Movie Sets, TV Shows, NFOs, Artwork & Subtitles', 'success');
}
