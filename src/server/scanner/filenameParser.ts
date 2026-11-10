import path from 'node:path';
import type { ParsedFilenameInfo } from '../../shared/types.js';

const VIDEO_EXTENSIONS = new Set([
  '.mkv',
  '.mp4',
  '.avi',
  '.m4v',
  '.mov',
  '.ts',
  '.m2ts',
  '.wmv',
  '.webm',
  '.flv',
  '.iso',
  '.strm',
]);

export function isVideoFile(filePath: string): boolean {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function isSampleOrExtraFile(filePath: string): boolean {
  const base = path.basename(filePath, path.extname(filePath)).toLowerCase();
  if (/(^|[-._ ])(sample|trailer|featurette|behindthescenes|deleted|extras?|interview)([-._ ]|$)/.test(base)) {
    return true;
  }
  return false;
}

export function parseMediaFilename(filePath: string, hintKind?: 'movie' | 'tvshow'): ParsedFilenameInfo {
  const ext = path.extname(filePath);
  const rawName = path.basename(filePath, ext);
  const folderName = path.basename(path.dirname(filePath));

  // Extract technical tags before stripping
  const resolutionMatch = rawName.match(/\b(2160p|4K|UHD|1080p|1080i|720p|576p|480p)\b/i);
  let resolution: string | null = null;
  if (resolutionMatch) {
    const r = resolutionMatch[1].toUpperCase();
    resolution = r === '4K' || r === 'UHD' ? '2160p' : r.toLowerCase();
  }

  const sourceMatch = rawName.match(/\b(REMUX)\b/i) ?? rawName.match(/\b(UHD\.?Blu-?Ray|Blu-?Ray|BDRip|BRRip|WEB-?DL|WEBRip|HDTV|DVDRip|DVD|AMZN|NF|DSNP)\b/i);
  const source = sourceMatch ? normalizeSource(sourceMatch[1]) : null;

  const videoCodecMatch = rawName.match(/\b(x265|H\.?265|HEVC|x264|H\.?264|AVC|AV1|VP9|XviD|MPEG-?2)\b/i);
  const videoCodec = videoCodecMatch ? normalizeVideoCodec(videoCodecMatch[1]) : null;

  const audioCodecMatch = rawName.match(/\b(TrueHD(?:\s*Atmos)?|DTS-?HD(?:\s*MA)?|DTS-?X|DTS|DD\+|DDP|EAC-?3|AC-?3|AAC|FLAC|Opus|LPCM|Atmos)\b/i);
  const audioCodec = audioCodecMatch ? normalizeAudioCodec(audioCodecMatch[1]) : null;

  const channelsMatch = rawName.match(/\b(7\.1|5\.1|2\.0|2\.1|1\.0)\b/);
  const audioChannels = channelsMatch
    ? channelsMatch[1] === '7.1'
      ? 8
      : channelsMatch[1] === '5.1'
        ? 6
        : channelsMatch[1] === '2.1'
          ? 3
          : channelsMatch[1] === '2.0'
            ? 2
            : 1
    : null;

  const hdrMatch = rawName.match(/\b(Dolby\.?Vision|DV|HDR10\+|HDR10|HDR|HLG)\b/i);
  const hdr = hdrMatch ? normalizeHdr(hdrMatch[1]) : null;

  const editionMatch = rawName.match(/\b(Extended(?:\s*Edition|\s*Cut)?|Director'?s\.?\s*Cut|Unrated|Theatrical(?:\s*Cut)?|IMAX|Remastered|Final\.?\s*Cut|Special\.?\s*Edition)\b/i);
  const edition = editionMatch ? editionMatch[1].replace(/\./g, ' ').trim() : null;

  const groupMatch = rawName.match(/-([A-Za-z0-9]{2,15})(?:\[[^\]]+\])?$/);
  const releaseGroup =
    groupMatch && !/^(1080p|2160p|720p|480p|x264|x265|hevc|bluray|webdl|remux|trailer|forced|sdh)$/i.test(groupMatch[1])
      ? groupMatch[1]
      : null;

  // Detect TV episode patterns: S01E02, S01E01-E02, S01E01E02, 1x02
  const epMultiMatch =
    rawName.match(/\bS(\d{1,2})E(\d{1,3})(?:-?E(\d{1,3}))\b/i) ??
    rawName.match(/\bS(\d{1,2})E(\d{1,3})\b/i) ??
    rawName.match(/\b(\d{1,2})x(\d{1,3})\b/i);

  const isEpisode = hintKind === 'tvshow' || Boolean(epMultiMatch);

  if (isEpisode && epMultiMatch) {
    const seasonNumber = Number(epMultiMatch[1]);
    const episodeNumber = Number(epMultiMatch[2]);
    const multiEpisodeEnd = epMultiMatch[3] ? Number(epMultiMatch[3]) : null;
    const beforeEp = rawName.slice(0, epMultiMatch.index ?? rawName.length);
    const afterEp = rawName.slice((epMultiMatch.index ?? 0) + epMultiMatch[0].length);
    const { title: showPart, year } = extractTitleAndYear(beforeEp);

    const epTitle = cleanReleaseNoise(afterEp);
    const cleanTitle = epTitle || `Episode ${episodeNumber}`;

    return {
      cleanTitle: cleanTitle || showPart || folderName,
      year,
      mediaKind: 'episode',
      seasonNumber,
      episodeNumber,
      multiEpisodeEnd,
      resolution,
      source,
      videoCodec,
      audioCodec,
      audioChannels,
      hdr,
      edition,
      releaseGroup,
    };
  }

  // Movie filename (also check parent folder if filename is generic)
  let { title, year } = extractTitleAndYear(rawName);
  if (!title || /^(movie|film|video|feature)$/i.test(title)) {
    const folderParsed = extractTitleAndYear(folderName);
    title = folderParsed.title || title;
    year = year ?? folderParsed.year;
  } else if (!year) {
    const folderParsed = extractTitleAndYear(folderName);
    year = folderParsed.year;
  }

  return {
    cleanTitle: title || rawName,
    year,
    mediaKind: hintKind === 'tvshow' ? 'episode' : 'movie',
    seasonNumber: null,
    episodeNumber: null,
    multiEpisodeEnd: null,
    resolution,
    source,
    videoCodec,
    audioCodec,
    audioChannels,
    hdr,
    edition,
    releaseGroup,
  };
}

export function extractTitleAndYear(raw: string): { title: string; year: number | null } {
  // Strip bracketed ID tags like [imdbid-tt12345], [tmdb-123], [1080p]
  let cleaned = raw
    .replace(/\[(imdbid|tmdbid|tvdbid|imdb|tmdb|tvdb)-[^\]]+\]/gi, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\{[^}]*\}/g, ' ');

  // Replace dots/underscores with spaces for parsing
  cleaned = cleaned.replace(/[._]/g, ' ').replace(/\s+/g, ' ').trim();

  // Look for year in parens "(2017)" or standalone " 2017 " using lookahead so adjacent years like "2049 2017" both match
  const yearMatches = [...cleaned.matchAll(/(?:^|\s|\()((?:19|20)\d{2})(?=\)|\s|$)/g)].filter((m) => {
    const idx = m.index ?? 0;
    const y = Number(m[1]);
    return idx > 0 && y >= 1900 && y <= 2035;
  });
  let year: number | null = null;
  let cutIndex = cleaned.length;

  if (yearMatches.length > 0) {
    const candidate = yearMatches[yearMatches.length - 1];
    year = Number(candidate[1]);
    cutIndex = candidate.index ?? cleaned.length;
  }

  let titlePart = cleaned.slice(0, cutIndex).trim();
  titlePart = cleanReleaseNoise(titlePart);
  // Trim trailing dashes or opening parens
  titlePart = titlePart.replace(/[-–—(]+$/g, '').trim();

  return { title: titlePart, year };
}

function cleanReleaseNoise(input: string): string {
  let s = input.replace(/[._]/g, ' ');
  // Cut at the first technical release token if any remain
  const noiseRegex =
    /\b(2160p|4K|UHD|1080p|1080i|720p|576p|480p|REMUX|Blu-?Ray|BDRip|BRRip|WEB-?DL|WEBRip|HDTV|DVDRip|x265|H\.?265|HEVC|x264|H\.?264|AVC|AV1|TrueHD|DTS-?HD|DTS|EAC-?3|AC-?3|DDP5\.?1|AAC|FLAC|Atmos|Dolby\s*Vision|HDR10\+?|HDR|IMAX|Extended(?:\s*Edition|\s*Cut)?|Director'?s\s*Cut|Unrated|Remastered|PROPER|REPACK|MULTI)\b/i;
  const match = s.match(noiseRegex);
  if (match && match.index !== undefined && match.index > 0) {
    s = s.slice(0, match.index);
  }
  s = s.replace(/-[A-Za-z0-9]{2,15}$/, '');
  s = s.replace(/\[[^\]]*\]/g, ' ');
  s = s.replace(/\(\s*\)/g, ' ');
  s = s.replace(/\s+/g, ' ').replace(/^[-–—.\s]+|[-–—.\s]+$/g, '').trim();
  return s;
}

function normalizeSource(raw: string): string {
  const u = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u.includes('REMUX')) return 'Remux';
  if (u.includes('UHDBLURAY')) return 'UHD BluRay';
  if (u.includes('BLURAY') || u === 'BDRIP' || u === 'BRRIP') return 'BluRay';
  if (u.includes('WEBDL')) return 'WEB-DL';
  if (u.includes('WEBRIP')) return 'WEBRip';
  if (u.includes('HDTV')) return 'HDTV';
  if (u.includes('DVD')) return 'DVD';
  return raw;
}

function normalizeVideoCodec(raw: string): string {
  const u = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u === 'X265' || u === 'H265' || u === 'HEVC') return 'HEVC';
  if (u === 'X264' || u === 'H264' || u === 'AVC') return 'H.264';
  if (u === 'AV1') return 'AV1';
  if (u === 'VP9') return 'VP9';
  return raw.toUpperCase();
}

function normalizeAudioCodec(raw: string): string {
  const u = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (u.includes('TRUEHD')) return 'TrueHD Atmos';
  if (u.includes('DTSHD')) return 'DTS-HD MA';
  if (u === 'DTSX') return 'DTS:X';
  if (u === 'DTS') return 'DTS';
  if (u === 'DDP' || u === 'DD' || u === 'EAC3') return 'EAC3';
  if (u === 'AC3') return 'AC3';
  if (u === 'AAC') return 'AAC';
  if (u === 'FLAC') return 'FLAC';
  if (u === 'ATMOS') return 'Atmos';
  return raw.toUpperCase();
}

function normalizeHdr(raw: string): string {
  const u = raw.toUpperCase().replace(/[^A-Z0-9+]/g, '');
  if (u === 'DV' || u.includes('DOLBYVISION')) return 'Dolby Vision';
  if (u === 'HDR10+') return 'HDR10+';
  if (u === 'HDR10' || u === 'HDR') return 'HDR10';
  if (u === 'HLG') return 'HLG';
  return raw;
}
