import { describe, expect, it } from 'vitest';
import { parseMediaFilename } from '../src/server/scanner/filenameParser.js';

describe('parseMediaFilename', () => {
  it('parses messy 4K UHD BluRay movie release filenames', () => {
    const res = parseMediaFilename(
      '/media/Movies/Blade.Runner.2049.2017.2160p.UHD.BluRay.REMUX.HEVC.TrueHD.Atmos.7.1-GROUP.mkv',
      'movie'
    );
    expect(res.mediaKind).toBe('movie');
    expect(res.cleanTitle).toBe('Blade Runner 2049');
    expect(res.year).toBe(2017);
    expect(res.resolution).toBe('2160p');
    expect(res.source).toBe('Remux');
    expect(res.videoCodec).toBe('HEVC');
    expect(res.audioCodec).toBe('TrueHD Atmos');
    expect(res.audioChannels).toBe(8);
    expect(res.releaseGroup).toBe('GROUP');

    const odyssey = parseMediaFilename('/media/Movies/2001.A.Space.Odyssey.1968.2160p.BluRay.mkv', 'movie');
    expect(odyssey.cleanTitle).toBe('2001 A Space Odyssey');
    expect(odyssey.year).toBe(1968);
  });

  it('parses editions and HDR tags cleanly', () => {
    const res = parseMediaFilename(
      '/media/Movies/Lord of the Rings (2001) Extended Edition 2160p WEB-DL Dolby.Vision H.265.mp4',
      'movie'
    );
    expect(res.cleanTitle).toBe('Lord of the Rings');
    expect(res.year).toBe(2001);
    expect(res.edition).toBe('Extended Edition');
    expect(res.hdr).toBe('Dolby Vision');
    expect(res.videoCodec).toBe('HEVC');
  });

  it('parses standard TV episode and multi-episode patterns', () => {
    const single = parseMediaFilename('/tv/Severance/Season 01/Severance.S01E09.The.We.We.Are.1080p.WEB-DL.H264.mkv', 'tvshow');
    expect(single.mediaKind).toBe('episode');
    expect(single.seasonNumber).toBe(1);
    expect(single.episodeNumber).toBe(9);
    expect(single.multiEpisodeEnd).toBeNull();
    expect(single.cleanTitle).toBe('The We We Are');

    const multi = parseMediaFilename('/tv/Breaking.Bad.S05E15-E16.Felina.720p.BluRay.x264.mkv', 'tvshow');
    expect(multi.seasonNumber).toBe(5);
    expect(multi.episodeNumber).toBe(15);
    expect(multi.multiEpisodeEnd).toBe(16);
    expect(multi.resolution).toBe('720p');

    const triple = parseMediaFilename('/tv/Andor/Season 01/Andor.S01E01-E02-E03.Ferrix.1080p.WEB-DL.mp4', 'tvshow');
    expect(triple.seasonNumber).toBe(1);
    expect(triple.episodeNumber).toBe(1);
    expect(triple.multiEpisodeEnd).toBe(3);

    const compactHyphen = parseMediaFilename('/tv/Andor/Season 01/Andor.S01E01-02.1080p.WEB-DL.mp4', 'tvshow');
    expect(compactHyphen.seasonNumber).toBe(1);
    expect(compactHyphen.episodeNumber).toBe(1);
    expect(compactHyphen.multiEpisodeEnd).toBe(2);

    const xMulti = parseMediaFilename('/tv/Arcane/Season 01/Arcane.1x01-03.Pilot.1080p.mkv', 'tvshow');
    expect(xMulti.seasonNumber).toBe(1);
    expect(xMulti.episodeNumber).toBe(1);
    expect(xMulti.multiEpisodeEnd).toBe(3);

    const noFalseRes = parseMediaFilename('/tv/Andor/Season 01/Andor.S01E01-1080p.WEB-DL.mp4', 'tvshow');
    expect(noFalseRes.seasonNumber).toBe(1);
    expect(noFalseRes.episodeNumber).toBe(1);
    expect(noFalseRes.multiEpisodeEnd).toBeNull();
  });
});
