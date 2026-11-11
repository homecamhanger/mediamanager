import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { promisify } from 'node:util';
import type { ParsedFilenameInfo, StreamDetails } from '../../shared/types.js';

const execFileAsync = promisify(execFile);

let ffprobeAvailable: boolean | null = null;

async function checkFfprobe(): Promise<boolean> {
  if (ffprobeAvailable !== null) return ffprobeAvailable;
  try {
    await execFileAsync('ffprobe', ['-version'], { timeout: 2000 });
    ffprobeAvailable = true;
  } catch {
    ffprobeAvailable = false;
  }
  return ffprobeAvailable;
}

export async function probeMediaFile(filePath: string, parsed: ParsedFilenameInfo): Promise<StreamDetails> {
  // 1. Try real ffprobe when available on host
  if (await checkFfprobe()) {
    try {
      const { stdout } = await execFileAsync(
        'ffprobe',
        ['-v', 'quiet', '-print_format', 'json', '-show_format', '-show_streams', filePath],
        { timeout: 10000 }
      );
      const data = JSON.parse(stdout) as {
        format?: { duration?: string };
        streams?: Array<Record<string, unknown>>;
      };
      const streams = data.streams ?? [];
      const durationSec = Math.round(Number(data.format?.duration ?? 0));

      const video = streams
        .filter((s) => s.codec_type === 'video')
        .map((s) => {
          const width = Number(s.width ?? 0);
          const height = Number(s.height ?? 0);
          const aspect = width && height ? (width / height).toFixed(2) : '1.78';
          return {
            codec: String(s.codec_name ?? parsed.videoCodec ?? 'h264').toUpperCase(),
            width,
            height,
            aspect,
            durationSeconds: durationSec || Math.round(Number(s.duration ?? 0)),
            hdrType: parsed.hdr ?? undefined,
            source: parsed.source ?? undefined,
            releaseGroup: parsed.releaseGroup ?? undefined,
          };
        });

      const audio = streams
        .filter((s) => s.codec_type === 'audio')
        .map((s) => ({
          codec: String(s.codec_name ?? parsed.audioCodec ?? 'aac').toUpperCase(),
          language: String((s.tags as Record<string, string> | undefined)?.language ?? 'eng'),
          channels: Number(s.channels ?? parsed.audioChannels ?? 2),
        }));

      const subtitle = streams
        .filter((s) => s.codec_type === 'subtitle')
        .map((s) => ({
          language: String((s.tags as Record<string, string> | undefined)?.language ?? 'eng'),
          title: (s.tags as Record<string, string> | undefined)?.title,
        }));

      if (video.length > 0 || audio.length > 0) {
        return { video, audio, subtitle };
      }
    } catch {
      // Fallback below
    }
  }

  // 2. Try lightweight MP4 atom reader on real files
  const mp4Info = tryReadMp4Container(filePath);
  if (mp4Info) {
    const width = mp4Info.width || resolutionToDims(parsed.resolution).width;
    const height = mp4Info.height || resolutionToDims(parsed.resolution).height;
    return {
      video: [
        {
          codec: parsed.videoCodec ?? mp4Info.videoCodec ?? 'H.264',
          width,
          height,
          aspect: width && height ? (width / height).toFixed(2) : '1.78',
          durationSeconds: mp4Info.durationSeconds || (parsed.mediaKind === 'episode' ? 2700 : 7200),
          hdrType: parsed.hdr ?? undefined,
          source: parsed.source ?? undefined,
          releaseGroup: parsed.releaseGroup ?? undefined,
        },
      ],
      audio: [
        {
          codec: parsed.audioCodec ?? mp4Info.audioCodec ?? 'AAC',
          language: 'eng',
          channels: parsed.audioChannels ?? 6,
        },
      ],
      subtitle: [],
    };
  }

  // 3. Fallback derived from filename release metadata
  const dims = resolutionToDims(parsed.resolution);
  return {
    video: [
      {
        codec: parsed.videoCodec ?? 'H.264',
        width: dims.width,
        height: dims.height,
        aspect: (dims.width / dims.height).toFixed(2),
        durationSeconds: parsed.mediaKind === 'episode' ? 2820 : 7560,
        hdrType: parsed.hdr ?? undefined,
        source: parsed.source ?? undefined,
        releaseGroup: parsed.releaseGroup ?? undefined,
      },
    ],
    audio: [
      {
        codec: parsed.audioCodec ?? (dims.height >= 1080 ? 'DTS-HD MA' : 'AAC'),
        language: 'eng',
        channels: parsed.audioChannels ?? (dims.height >= 1080 ? 6 : 2),
      },
    ],
    subtitle: [],
  };
}

function resolutionToDims(res: string | null): { width: number; height: number } {
  switch ((res ?? '').toLowerCase()) {
    case '2160p':
      return { width: 3840, height: 2160 };
    case '1080p':
    case '1080i':
      return { width: 1920, height: 1080 };
    case '720p':
      return { width: 1280, height: 720 };
    case '576p':
      return { width: 720, height: 576 };
    case '480p':
      return { width: 720, height: 480 };
    default:
      return { width: 1920, height: 1080 };
  }
}

interface Mp4ProbeResult {
  width: number;
  height: number;
  durationSeconds: number;
  videoCodec?: string;
  audioCodec?: string;
}

/**
 * Pure-JS lightweight ISOBMFF/MP4 atom header parser:
 * reads mvhd duration and tkhd width/height from valid MP4 files without external binaries.
 */
function tryReadMp4Container(filePath: string): Mp4ProbeResult | null {
  try {
    const stat = fs.statSync(filePath);
    if (stat.size < 24) return null;
    const readSize = Math.min(stat.size, 65536);
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(readSize);
    fs.readSync(fd, buf, 0, readSize, 0);
    fs.closeSync(fd);

    // Check ftyp box
    if (buf.toString('ascii', 4, 8) !== 'ftyp') return null;

    let durationSeconds = 0;
    let width = 0;
    let height = 0;

    // Scan for mvhd and tkhd boxes in the header buffer
    const mvhdIdx = buf.indexOf(Buffer.from('mvhd'));
    if (mvhdIdx >= 4 && mvhdIdx + 24 < buf.length) {
      const version = buf[mvhdIdx + 4];
      if (version === 0 && mvhdIdx + 24 <= buf.length) {
        const timescale = buf.readUInt32BE(mvhdIdx + 16);
        const duration = buf.readUInt32BE(mvhdIdx + 20);
        if (timescale > 0) durationSeconds = Math.round(duration / timescale);
      }
    }

    const tkhdIdx = buf.indexOf(Buffer.from('tkhd'));
    if (tkhdIdx >= 4 && tkhdIdx + 88 <= buf.length) {
      const version = buf[tkhdIdx + 4];
      if (version === 0) {
        // Fixed-point 16.16 width & height at offset 76 and 80 from box payload start (tkhdIdx + 4)
        const w = buf.readUInt32BE(tkhdIdx + 80) >> 16;
        const h = buf.readUInt32BE(tkhdIdx + 84) >> 16;
        if (w > 0 && h > 0 && w <= 8192 && h <= 4320) {
          width = w;
          height = h;
        }
      }
    }

    let videoCodec: string | undefined;
    if (buf.includes(Buffer.from('hvc1')) || buf.includes(Buffer.from('hev1'))) videoCodec = 'HEVC';
    else if (buf.includes(Buffer.from('avc1'))) videoCodec = 'H.264';
    else if (buf.includes(Buffer.from('av01'))) videoCodec = 'AV1';

    let audioCodec: string | undefined;
    if (buf.includes(Buffer.from('ec-3'))) audioCodec = 'EAC3';
    else if (buf.includes(Buffer.from('ac-3'))) audioCodec = 'AC3';
    else if (buf.includes(Buffer.from('mp4a'))) audioCodec = 'AAC';

    return { width, height, durationSeconds, videoCodec, audioCodec };
  } catch {
    return null;
  }
}

/**
 * Writes a minimal valid MP4 container with real mvhd (duration), tkhd (dimensions),
 * and codec boxes (avc1/hvc1 + mp4a/ec-3) for sample library generation.
 */
export function createMinimalValidMp4(opts: {
  width: number;
  height: number;
  durationSeconds: number;
  videoFourcc?: 'avc1' | 'hvc1';
  audioFourcc?: 'mp4a' | 'ec-3';
}): Buffer {
  const box = (type: string, payload: Buffer): Buffer => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(8 + payload.length, 0);
    header.write(type, 4, 4, 'ascii');
    return Buffer.concat([header, payload]);
  };

  const ftyp = box('ftyp', Buffer.concat([Buffer.from('isom'), Buffer.from([0, 0, 2, 0]), Buffer.from('isomiso2mp41')]));

  // mvhd v0 (100 bytes payload)
  const mvhdPayload = Buffer.alloc(100);
  const timescale = 1000;
  mvhdPayload.writeUInt32BE(timescale, 12);
  mvhdPayload.writeUInt32BE(opts.durationSeconds * timescale, 16);
  mvhdPayload.writeUInt32BE(0x00010000, 20); // rate 1.0
  mvhdPayload.writeUInt16BE(0x0100, 24); // volume 1.0
  mvhdPayload.writeUInt32BE(0x00010000, 36); // matrix a
  mvhdPayload.writeUInt32BE(0x00010000, 52); // matrix d
  mvhdPayload.writeUInt32BE(0x40000000, 68); // matrix w
  mvhdPayload.writeUInt32BE(2, 96); // next_track_ID
  const mvhd = box('mvhd', mvhdPayload);

  // tkhd v0 (84 bytes payload)
  const tkhdPayload = Buffer.alloc(84);
  tkhdPayload.writeUInt32BE(0x00000003, 0); // version 0, flags=3 (enabled+in_movie)
  tkhdPayload.writeUInt32BE(1, 12); // track_ID
  tkhdPayload.writeUInt32BE(opts.durationSeconds * timescale, 20);
  tkhdPayload.writeUInt32BE(0x00010000, 40);
  tkhdPayload.writeUInt32BE(0x00010000, 56);
  tkhdPayload.writeUInt32BE(0x40000000, 72);
  tkhdPayload.writeUInt32BE((opts.width & 0xffff) << 16, 76);
  tkhdPayload.writeUInt32BE((opts.height & 0xffff) << 16, 80);
  const tkhd = box('tkhd', tkhdPayload);

  // minimal codec marker box inside udta/meta so probe picks up fourcc cleanly
  const codecTag = Buffer.from((opts.videoFourcc ?? 'avc1') + (opts.audioFourcc ?? 'mp4a'), 'ascii');
  const trak = box('trak', Buffer.concat([tkhd, box('udta', codecTag)]));
  const moov = box('moov', Buffer.concat([mvhd, trak]));
  const mdat = box('mdat', Buffer.alloc(64));

  return Buffer.concat([ftyp, moov, mdat]);
}
