import { describe, expect, it } from 'vitest';
import {
  parseEpisodeNfoXml,
  parseMovieNfoXml,
  serializeEpisodeNfo,
  serializeMovieNfo,
  validateKodiNfoXml,
} from '../src/server/nfo/kodiNfo.js';
import type { MovieRecord, TvEpisodeRecord } from '../src/shared/types.js';

describe('Kodi NFO parser, serializer, and validator', () => {
  it('round-trips a full Kodi v21 movie NFO including multi-source ratings, set, actors, and streamdetails', () => {
    const movie: MovieRecord = {
      id: 1,
      sourceId: 1,
      folderPath: '/movies/Dune (2021)',
      filePath: '/movies/Dune (2021)/Dune.mp4',
      fileName: 'Dune.mp4',
      fileSizeBytes: 1024,
      movieHash: '0123456789abcdef',
      nfoPath: '/movies/Dune (2021)/movie.nfo',
      hasNfo: true,
      nfoValid: true,
      nfoWarnings: [],
      scraped: true,
      scrapedSource: 'tmdb, omdb',
      title: 'Dune',
      originalTitle: 'Dune: Part One',
      sortTitle: 'Dune 1',
      year: 2021,
      premiered: '2021-10-22',
      tagline: 'Beyond fear, destiny awaits.',
      plot: 'Paul Atreides travels to Arrakis.',
      outline: 'Paul Atreides travels to Arrakis.',
      runtimeMinutes: 155,
      mpaa: 'Rated PG-13',
      country: 'United States',
      studios: ['Legendary Pictures'],
      genres: ['Science Fiction', 'Adventure'],
      tags: ['desert', 'epic'],
      directors: ['Denis Villeneuve'],
      writers: ['Jon Spaihts'],
      actors: [{ name: 'Timothée Chalamet', role: 'Paul Atreides', order: 0 }],
      trailerUrl: 'https://www.youtube.com/watch?v=8g18jFHCLXk',
      setId: 1,
      setName: 'Dune Collection',
      setOverview: 'Frank Herbert sci-fi saga.',
      uniqueIds: { imdb: 'tt1160419', tmdb: '438631' },
      ratings: [
        { source: 'imdb', value: 8.0, max: 10, votes: 892000, isDefault: true },
        { source: 'rottentomatoes', value: 83, max: 100, votes: 514 },
      ],
      userRating: 9,
      playCount: 2,
      watched: true,
      lastPlayed: '2026-10-01 20:00:00',
      dateAdded: '2026-10-01T10:00:00.000Z',
      artwork: {
        poster: 'poster.jpg',
        fanart: 'fanart.jpg',
        banner: null,
        clearlogo: null,
        clearart: null,
        disc: null,
        landscape: null,
        thumb: null,
      },
      streamDetails: {
        video: [{ codec: 'HEVC', width: 3840, height: 2160, aspect: '1.78', durationSeconds: 9300, hdrType: 'HDR10' }],
        audio: [{ codec: 'TrueHD Atmos', language: 'eng', channels: 8 }],
        subtitle: [{ language: 'eng' }],
      },
      subtitles: [],
      parsedInfo: {
        cleanTitle: 'Dune',
        year: 2021,
        mediaKind: 'movie',
        seasonNumber: null,
        episodeNumber: null,
        multiEpisodeEnd: null,
        resolution: '2160p',
        source: 'BluRay',
        videoCodec: 'HEVC',
        audioCodec: 'TrueHD Atmos',
        audioChannels: 8,
        hdr: 'HDR10',
        edition: null,
        releaseGroup: null,
      },
      updatedAt: '2026-10-01T10:00:00.000Z',
    };

    const xml = serializeMovieNfo(movie);
    const report = validateKodiNfoXml(xml);
    expect(report.valid).toBe(true);
    expect(report.hasUniqueIdDefault).toBe(true);
    expect(report.hasRatingsBlock).toBe(true);
    expect(report.hasStreamDetails).toBe(true);
    expect(report.warnings).toHaveLength(0);

    const parsed = parseMovieNfoXml(xml);
    expect(parsed?.title).toBe('Dune');
    expect(parsed?.setName).toBe('Dune Collection');
    expect(parsed?.uniqueIds?.imdb).toBe('tt1160419');
    expect(parsed?.ratings?.find((r) => r.source === 'rottentomatoes')?.value).toBe(83);
    expect(parsed?.actors?.[0].name).toBe('Timothée Chalamet');
    expect(parsed?.streamDetails?.video[0].height).toBe(2160);
    expect(parsed?.watched).toBe(true);
  });

  it('supports multi-episode <episodedetails> NFO serialization and parsing', () => {
    const ep: TvEpisodeRecord = {
      id: 1,
      showId: 1,
      seasonNumber: 1,
      episodeNumber: 1,
      multiEpisodeEnd: 2,
      folderPath: '/tv/Show/Season 01',
      filePath: '/tv/Show/Season 01/Show - S01E01-E02.mkv',
      fileName: 'Show - S01E01-E02.mkv',
      fileSizeBytes: 500,
      movieHash: null,
      nfoPath: null,
      hasNfo: false,
      nfoValid: false,
      nfoWarnings: [],
      scraped: true,
      title: 'Two-Part Premiere',
      showTitle: 'Test Show',
      aired: '2024-01-10',
      plot: 'Double episode premiere.',
      runtimeMinutes: 90,
      directors: ['Director One'],
      writers: ['Writer One'],
      actors: [],
      uniqueIds: { tvdb: '991' },
      ratings: [{ source: 'imdb', value: 8.8, max: 10, isDefault: true }],
      userRating: null,
      playCount: 0,
      watched: false,
      lastPlayed: null,
      thumbPath: null,
      streamDetails: { video: [], audio: [], subtitle: [] },
      subtitles: [],
      parsedInfo: {
        cleanTitle: 'Two-Part Premiere',
        year: null,
        mediaKind: 'episode',
        seasonNumber: 1,
        episodeNumber: 1,
        multiEpisodeEnd: 2,
        resolution: '1080p',
        source: null,
        videoCodec: null,
        audioCodec: null,
        audioChannels: null,
        hdr: null,
        edition: null,
        releaseGroup: null,
      },
    };

    const xml = serializeEpisodeNfo(ep);
    const parsed = parseEpisodeNfoXml(xml);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].episodeNumber).toBe(1);
    expect(parsed[1].episodeNumber).toBe(2);
    // Clean fallback for Part 2 should NOT clone Part 1's uniqueId or plot
    expect(parsed[1].title).toBe('Two-Part Premiere (Part 2)');
    expect(parsed[1].uniqueIds?.tvdb).toBeUndefined();
    expect(parsed[1].plot).toBe('');
  });

  it('serializes distinct multiEpisodeParts and validates all sibling <episodedetails> blocks', () => {
    const ep: TvEpisodeRecord = {
      id: 2,
      showId: 1,
      seasonNumber: 1,
      episodeNumber: 1,
      multiEpisodeEnd: 2,
      multiEpisodeParts: [
        {
          seasonNumber: 1,
          episodeNumber: 2,
          title: 'That Would Be Me',
          aired: '2022-09-21',
          plot: 'Part 2 distinct plot.',
          runtimeMinutes: 37,
          directors: ['Toby Haynes'],
          writers: ['Tony Gilroy'],
          actors: [{ name: 'Kyle Soller', role: 'Syril Karn', order: 0 }],
          uniqueIds: { imdb: 'tt15159840' },
          ratings: [{ source: 'imdb', value: 7.6, max: 10, votes: 9800, isDefault: true }],
          userRating: 8,
          playCount: 1,
          watched: true,
          lastPlayed: '2026-10-10 20:00:00',
        },
      ],
      folderPath: '/tv/Andor/Season 01',
      filePath: '/tv/Andor/Season 01/Andor - S01E01-E02.mp4',
      fileName: 'Andor - S01E01-E02.mp4',
      fileSizeBytes: 500,
      movieHash: null,
      nfoPath: null,
      hasNfo: false,
      nfoValid: false,
      nfoWarnings: [],
      scraped: true,
      title: 'Kassa',
      showTitle: 'Andor',
      aired: '2022-09-21',
      plot: 'Part 1 distinct plot.',
      runtimeMinutes: 42,
      directors: ['Toby Haynes'],
      writers: ['Tony Gilroy'],
      actors: [],
      uniqueIds: { imdb: 'tt13622776' },
      ratings: [{ source: 'imdb', value: 7.5, max: 10, votes: 10400, isDefault: true }],
      userRating: null,
      playCount: 0,
      watched: false,
      lastPlayed: null,
      thumbPath: null,
      streamDetails: {
        video: [{ codec: 'HEVC', width: 1920, height: 1080, aspect: '1.78', durationSeconds: 2520 }],
        audio: [{ codec: 'EAC3', language: 'eng', channels: 6 }],
        subtitle: [],
      },
      subtitles: [],
      parsedInfo: {
        cleanTitle: 'Kassa',
        year: null,
        mediaKind: 'episode',
        seasonNumber: 1,
        episodeNumber: 1,
        multiEpisodeEnd: 2,
        resolution: '1080p',
        source: null,
        videoCodec: null,
        audioCodec: null,
        audioChannels: null,
        hdr: null,
        edition: null,
        releaseGroup: null,
      },
    };

    const xml = serializeEpisodeNfo(ep);
    const parsed = parseEpisodeNfoXml(xml);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe('Kassa');
    expect(parsed[0].uniqueIds?.imdb).toBe('tt13622776');
    expect(parsed[1].title).toBe('That Would Be Me');
    expect(parsed[1].plot).toBe('Part 2 distinct plot.');
    expect(parsed[1].uniqueIds?.imdb).toBe('tt15159840');
    expect(parsed[1].watched).toBe(true);
    expect(parsed[1].actors?.[0]?.name).toBe('Kyle Soller');

    const rep = validateKodiNfoXml(xml);
    expect(rep.valid).toBe(true);
    expect(rep.warnings).toHaveLength(0);

    // Multi-block validator catches duplicate season/episode keys and Part 2 warnings
    const dupXml = `<?xml version="1.0" encoding="UTF-8"?>
<episodedetails><title>A</title><season>1</season><episode>1</episode><uniqueid type="imdb" default="true">tt1</uniqueid></episodedetails>
<episodedetails><title>B</title><season>1</season><episode>1</episode></episodedetails>`;
    const dupRep = validateKodiNfoXml(dupXml);
    expect(dupRep.valid).toBe(true);
    expect(dupRep.warnings.some((w) => w.includes('Duplicate season/episode number'))).toBe(true);
    expect(dupRep.warnings.some((w) => w.includes('Part 2'))).toBe(true);
  });

  it('flags legacy NFO warnings cleanly', () => {
    const legacy = `<movie><title>Old Film</title><rating>7.5</rating><id>tt000001</id></movie>`;
    const report = validateKodiNfoXml(legacy);
    expect(report.valid).toBe(true);
    expect(report.hasRatingsBlock).toBe(false);
    expect(report.warnings.length).toBeGreaterThan(0);
  });
});
