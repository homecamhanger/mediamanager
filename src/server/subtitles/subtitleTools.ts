import path from 'node:path';
import type { SubtitleCue } from '../../shared/types.js';

const SUBTITLE_EXTENSIONS = new Set(['.srt', '.ass', '.ssa', '.vtt', '.sub']);

export function isSubtitleFile(filePath: string): boolean {
  return SUBTITLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

const LANG_NAME_MAP: Record<string, string> = {
  en: 'English',
  eng: 'English',
  es: 'Spanish',
  spa: 'Spanish',
  fr: 'French',
  fra: 'French',
  fre: 'French',
  de: 'German',
  deu: 'German',
  ger: 'German',
  ja: 'Japanese',
  jpn: 'Japanese',
  ko: 'Korean',
  kor: 'Korean',
  zh: 'Chinese',
  zho: 'Chinese',
  chi: 'Chinese',
  pt: 'Portuguese',
  por: 'Portuguese',
  it: 'Italian',
  ita: 'Italian',
  nl: 'Dutch',
  ru: 'Russian',
  pl: 'Polish',
  sv: 'Swedish',
  ar: 'Arabic',
  und: 'Unknown',
};

export function getLanguageDisplayName(code: string): string {
  return LANG_NAME_MAP[code.toLowerCase()] ?? code.toUpperCase();
}

export function normalizeLangCode(code: string): string {
  const c = code.toLowerCase().trim();
  const map: Record<string, string> = {
    eng: 'en',
    spa: 'es',
    fra: 'fr',
    fre: 'fr',
    deu: 'de',
    ger: 'de',
    jpn: 'ja',
    kor: 'ko',
    zho: 'zh',
    chi: 'zh',
    por: 'pt',
    ita: 'it',
    nld: 'nl',
    dut: 'nl',
    rus: 'ru',
    pol: 'pl',
    swe: 'sv',
    ara: 'ar',
  };
  return map[c] ?? c;
}

export function parseSubtitleFilename(
  subFilePath: string,
  videoBaseName: string
): { language: string; format: 'srt' | 'ass' | 'ssa' | 'vtt' | 'sub'; forced: boolean; sdh: boolean } {
  const ext = path.extname(subFilePath).toLowerCase();
  const format = (ext.slice(1) || 'srt') as 'srt' | 'ass' | 'ssa' | 'vtt' | 'sub';
  const base = path.basename(subFilePath, ext);
  const suffix = base.startsWith(videoBaseName) ? base.slice(videoBaseName.length) : base;
  const tokens = suffix
    .split('.')
    .map((t) => t.trim().toLowerCase())
    .filter(Boolean);

  let forced = false;
  let sdh = false;
  let language = 'und';

  for (const t of tokens) {
    if (t === 'forced') {
      forced = true;
    } else if (t === 'sdh' || t === 'hi' || t === 'cc') {
      sdh = true;
    } else if (/^[a-z]{2,3}(-[a-z0-9]{2,4})?$/.test(t)) {
      language = normalizeLangCode(t);
    }
  }

  return { language, format, forced, sdh };
}

export function buildKodiSubtitleFileName(
  videoBaseName: string,
  opts: { language: string; forced?: boolean; sdh?: boolean; format?: string }
): string {
  const lang = normalizeLangCode(opts.language || 'en');
  const parts = [videoBaseName, lang];
  if (opts.forced) parts.push('forced');
  if (opts.sdh) parts.push('sdh');
  return `${parts.join('.')}.${opts.format ?? 'srt'}`;
}

function parseTimestampMs(raw: string): number {
  const m = raw.trim().match(/^(?:(\d{1,2}):)?(\d{2}):(\d{2})[,.](\d{3})$/);
  if (!m) return 0;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(m[4]);
  return ((h * 60 + min) * 60 + s) * 1000 + ms;
}

export function formatSrtTimestamp(ms: number): string {
  const clamped = Math.max(0, Math.round(ms));
  const h = Math.floor(clamped / 3600000);
  const min = Math.floor((clamped % 3600000) / 60000);
  const s = Math.floor((clamped % 60000) / 1000);
  const rem = clamped % 1000;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(rem).padStart(3, '0')}`;
}

export function parseSubtitleContent(content: string): SubtitleCue[] {
  const cleaned = content.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/^WEBVTT[^\n]*\n+/i, '');
  const blocks = cleaned.split(/\n{2,}/);
  const cues: SubtitleCue[] = [];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;
    const timingLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timingLineIdx === -1) continue;
    const [startRaw, endRaw] = lines[timingLineIdx].split('-->').map((p) => p.trim().split(/\s+/)[0]);
    const text = lines.slice(timingLineIdx + 1).join('\n').trim();
    cues.push({
      index: cues.length + 1,
      startMs: parseTimestampMs(startRaw),
      endMs: parseTimestampMs(endRaw),
      text,
    });
  }
  return cues;
}

export function serializeCuesToSrt(cues: SubtitleCue[]): string {
  return (
    cues
      .map((c, idx) => `${idx + 1}\n${formatSrtTimestamp(c.startMs)} --> ${formatSrtTimestamp(c.endMs)}\n${c.text}`)
      .join('\n\n') + '\n'
  );
}

export function shiftSubtitleCues(cues: SubtitleCue[], offsetMs: number): SubtitleCue[] {
  return cues.map((c) => ({
    ...c,
    startMs: Math.max(0, c.startMs + offsetMs),
    endMs: Math.max(0, c.endMs + offsetMs),
  }));
}

export function rescaleSubtitleFps(cues: SubtitleCue[], fromFps: number, toFps: number): SubtitleCue[] {
  if (!fromFps || !toFps || fromFps === toFps) return cues;
  const ratio = fromFps / toFps;
  return cues.map((c) => ({
    ...c,
    startMs: Math.max(0, Math.round(c.startMs * ratio)),
    endMs: Math.max(0, Math.round(c.endMs * ratio)),
  }));
}

export function stripHearingImpairedCues(cues: SubtitleCue[]): SubtitleCue[] {
  const out: SubtitleCue[] = [];
  for (const c of cues) {
    let txt = c.text
      .replace(/\[[^\]]*\]/g, '')
      .replace(/\([^)]*\)/g, '')
      .replace(/♪[^♪\n]*♪/g, '')
      .replace(/^[A-Z][A-Z0-9\s]{1,18}:\s*/gm, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
    if (txt) {
      out.push({ ...c, index: out.length + 1, text: txt });
    }
  }
  return out;
}
