import { describe, expect, it } from 'vitest';
import {
  episodeDisplay,
  episodeFileLabel,
  episodeFilePath,
  hasPlot,
} from '../src/client/lib/episodeDisplay.js';

const ep = (over: Partial<Parameters<typeof episodeDisplay>[0]> = {}) => ({
  title: 'Serenity',
  plot: 'The crew of Serenity takes on a transport job.',
  fileName: 'Firefly - S01E01 - Serenity.mkv',
  folderPath: '/tv/Firefly (2002)/Season 1',
  ...over,
});

describe('Episode display', () => {
  it('always exposes the file name, even when a plot exists', () => {
    // The bug: `plot || fileName` meant the file name disappeared once scraped.
    const d = episodeDisplay(ep());
    expect(d.plot).toBe('The crew of Serenity takes on a transport job.');
    expect(d.fileName).toBe('Firefly - S01E01 - Serenity.mkv');
  });

  it('shows the file name for an unscraped episode with no plot', () => {
    const d = episodeDisplay(ep({ plot: '' }));
    expect(d.plot).toBeNull();
    expect(d.fileName).toBe('Firefly - S01E01 - Serenity.mkv');
    expect(d.title).toBe('Serenity');
  });

  it('falls back to the file name when the title is empty', () => {
    expect(episodeDisplay(ep({ title: '' })).title).toBe('Firefly - S01E01 - Serenity.mkv');
    expect(episodeDisplay(ep({ title: '   ' })).title).toBe('Firefly - S01E01 - Serenity.mkv');
  });

  it('treats whitespace-only plots as absent', () => {
    expect(hasPlot({ plot: '' })).toBe(false);
    expect(hasPlot({ plot: '   \n  ' })).toBe(false);
    expect(hasPlot({ plot: 'Something happens.' })).toBe(true);
  });

  it('never returns the plot in place of the file name', () => {
    const d = episodeDisplay(ep());
    expect(d.fileName).not.toBe(d.plot);
  });

  it('builds a POSIX path for the tooltip', () => {
    expect(episodeFilePath({ folderPath: '/tv/Firefly (2002)/Season 1', fileName: 'E1.mkv' })).toBe(
      '/tv/Firefly (2002)/Season 1/E1.mkv'
    );
  });

  it('builds a Windows path when the folder uses backslashes', () => {
    expect(episodeFilePath({ folderPath: 'D:\\TV\\Firefly\\Season 1', fileName: 'E1.mkv' })).toBe(
      'D:\\TV\\Firefly\\Season 1\\E1.mkv'
    );
  });

  it('does not double up separators for a trailing slash', () => {
    expect(episodeFilePath({ folderPath: '/tv/Firefly/', fileName: 'E1.mkv' })).toBe(
      '/tv/Firefly/E1.mkv'
    );
  });

  it('returns the bare file name for the secondary line', () => {
    expect(episodeFileLabel({ fileName: 'Firefly - S01E01 - Serenity.mkv' })).toBe(
      'Firefly - S01E01 - Serenity.mkv'
    );
  });
});
