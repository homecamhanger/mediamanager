import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { computeOpenSubtitlesHash } from '../src/server/subtitles/openSubtitlesHash.js';
import {
  buildKodiSubtitleFileName,
  parseSubtitleContent,
  parseSubtitleFilename,
  rescaleSubtitleFps,
  serializeCuesToSrt,
  shiftSubtitleCues,
  stripHearingImpairedCues,
} from '../src/server/subtitles/subtitleTools.js';

describe('Subtitle tools and OpenSubtitles hash', () => {
  it('parses and builds Kodi subtitle filenames with forced and SDH flags', () => {
    const parsed = parseSubtitleFilename('/movies/Dune (2021).eng.forced.sdh.srt', 'Dune (2021)');
    expect(parsed.language).toBe('en');
    expect(parsed.forced).toBe(true);
    expect(parsed.sdh).toBe(true);
    expect(parsed.format).toBe('srt');

    const built = buildKodiSubtitleFileName('Dune (2021)', { language: 'es', forced: true, sdh: false });
    expect(built).toBe('Dune (2021).es.forced.srt');
  });

  it('shifts timestamps, rescales FPS, and strips HI annotations', () => {
    const sampleSrt = `1\n00:00:05,000 --> 00:00:08,000\n[DOOR SLAMS]\nJOHN: Hello there!\n\n2\n00:00:10,000 --> 00:00:12,000\n(dramatic music)\n`;
    const cues = parseSubtitleContent(sampleSrt);
    expect(cues).toHaveLength(2);

    const shifted = shiftSubtitleCues(cues, -2000);
    expect(shifted[0].startMs).toBe(3000);

    const rescaled = rescaleSubtitleFps(shifted, 25, 23.976);
    expect(rescaled[0].startMs).toBeGreaterThan(3000);

    const clean = stripHearingImpairedCues(cues);
    expect(clean).toHaveLength(1);
    expect(clean[0].text).toBe('Hello there!');

    const serialized = serializeCuesToSrt(clean);
    expect(serialized).toContain('00:00:05,000 --> 00:00:08,000');
  });

  it('computes deterministic 16-char hex OpenSubtitles 64-bit hash', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kv-hash-'));
    const file = path.join(tmp, 'test.mp4');
    fs.writeFileSync(file, Buffer.alloc(150_000, 0x2a));
    const h1 = computeOpenSubtitlesHash(file);
    const h2 = computeOpenSubtitlesHash(file);
    expect(h1).toHaveLength(16);
    expect(h1).toBe(h2);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
