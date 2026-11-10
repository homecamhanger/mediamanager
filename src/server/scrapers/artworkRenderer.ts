import fs from 'node:fs';
import path from 'node:path';
import { Resvg } from '@resvg/resvg-js';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';
import type { ArtworkKind } from '../../shared/types.js';

export interface ArtworkRenderInput {
  kind: ArtworkKind;
  title: string;
  subtitle?: string;
  year?: number | null;
  tagline?: string;
  genres?: string[];
  rating?: number | null;
  accentColor?: string;
  secondaryColor?: string;
  seasonNumber?: number;
  episodeCode?: string;
}

const PALETTES: Array<[string, string, string]> = [
  ['#0f172a', '#0ea5e9', '#38bdf8'], // Sci-Fi Cyan
  ['#1e1b4b', '#8b5cf6', '#c084fc'], // Cosmic Violet
  ['#1c1917', '#f59e0b', '#fbbf24'], // Noir Amber
  ['#1f1215', '#e11d48', '#fb7185'], // Thriller Crimson
  ['#0d1f1a', '#10b981', '#34d399'], // Adventure Emerald
  ['#172554', '#3b82f6', '#60a5fa'], // Drama Cobalt
];

function pickPalette(title: string, genres: string[] = []): [string, string, string] {
  const g = genres.join(' ').toLowerCase();
  if (g.includes('sci-fi') || g.includes('science fiction')) return PALETTES[0];
  if (g.includes('animation') || g.includes('fantasy')) return PALETTES[1];
  if (g.includes('crime') || g.includes('mystery') || g.includes('western')) return PALETTES[2];
  if (g.includes('thriller') || g.includes('horror') || g.includes('action')) return PALETTES[3];
  if (g.includes('adventure') || g.includes('documentary')) return PALETTES[4];
  let hash = 0;
  for (let i = 0; i < title.length; i++) hash = (hash * 31 + title.charCodeAt(i)) | 0;
  return PALETTES[Math.abs(hash) % PALETTES.length];
}

function escapeSvg(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function wrapTitleLines(title: string, maxCharsPerLine: number): string[] {
  const words = title.trim().split(/\s+/);
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    if (!cur) {
      cur = w;
    } else if (cur.length + 1 + w.length <= maxCharsPerLine) {
      cur += ' ' + w;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 4);
}

export function buildArtworkSvg(input: ArtworkRenderInput): { svg: string; width: number; height: number } {
  const [bg, accent, highlight] = pickPalette(input.title, input.genres);
  const cAccent = input.accentColor ?? accent;
  const cHigh = input.secondaryColor ?? highlight;
  const titleLines = wrapTitleLines(input.title, input.kind === 'poster' ? 14 : 24);
  const genreText = escapeSvg((input.genres ?? []).slice(0, 3).join('  •  ').toUpperCase() || 'FEATURE PRESENTATION');
  const yearText = input.year ? String(input.year) : '';
  const ratingBadge = input.rating ? `★ ${input.rating.toFixed(1)}` : '';
  const subtitleText = escapeSvg(input.subtitle ?? input.tagline ?? '');

  if (input.kind === 'clearlogo') {
    const width = 800;
    const height = 310;
    const fontSize = input.title.length > 18 ? 52 : 66;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#ffffff"/>
          <stop offset="65%" stop-color="${cHigh}"/>
          <stop offset="100%" stop-color="${cAccent}"/>
        </linearGradient>
      </defs>
      <rect x="40" y="232" width="720" height="4" rx="2" fill="${cAccent}" opacity="0.85"/>
      ${titleLines
        .slice(0, 2)
        .map((line, i) => {
          const y = titleLines.length > 1 ? 118 + i * 68 : 155;
          return `<text x="400" y="${y}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="${fontSize}" letter-spacing="4" fill="url(#lg)">${escapeSvg(line.toUpperCase())}</text>`;
        })
        .join('')}
      ${yearText ? `<text x="400" y="274" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="22" letter-spacing="8" fill="#e2e8f0">${escapeSvg(yearText)}</text>` : ''}
    </svg>`;
    return { svg, width, height };
  }

  if (input.kind === 'disc') {
    const size = 600;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <defs>
        <radialGradient id="dg" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color="${cAccent}" stop-opacity="0.3"/>
          <stop offset="65%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="#020617"/>
        </radialGradient>
      </defs>
      <circle cx="300" cy="300" r="288" fill="url(#dg)" stroke="${cHigh}" stroke-width="6"/>
      <circle cx="300" cy="300" r="265" fill="none" stroke="#ffffff" stroke-opacity="0.12" stroke-width="2"/>
      <circle cx="300" cy="300" r="95" fill="#0b0f17" stroke="${cAccent}" stroke-width="4"/>
      <circle cx="300" cy="300" r="46" fill="none" stroke="#94a3b8" stroke-width="3"/>
      <text x="300" y="135" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="30" fill="#f8fafc" letter-spacing="2">${escapeSvg(titleLines[0]?.toUpperCase() ?? '')}</text>
      <text x="300" y="475" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="20" fill="${cHigh}" letter-spacing="5">${escapeSvg(yearText || 'BLU-RAY')}</text>
    </svg>`;
    return { svg, width: size, height: size };
  }

  if (input.kind === 'banner') {
    const width = 1000;
    const height = 185;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="bgb" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${bg}"/>
          <stop offset="60%" stop-color="#090d16"/>
          <stop offset="100%" stop-color="${cAccent}" stop-opacity="0.55"/>
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bgb)"/>
      <circle cx="880" cy="92" r="160" fill="${cAccent}" opacity="0.16"/>
      <rect x="0" y="0" width="10" height="${height}" fill="${cAccent}"/>
      <text x="48" y="88" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="46" letter-spacing="2" fill="#f8fafc">${escapeSvg(input.title.toUpperCase())}</text>
      <text x="50" y="134" font-family="DejaVu Sans, Arial, sans-serif" font-weight="600" font-size="18" letter-spacing="4" fill="${cHigh}">${genreText}${yearText ? `  •  ${yearText}` : ''}</text>
    </svg>`;
    return { svg, width, height };
  }

  if (input.kind === 'clearart') {
    const width = 800;
    const height = 450;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="ca" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${cAccent}" stop-opacity="0.88"/>
          <stop offset="100%" stop-color="${cHigh}" stop-opacity="0.65"/>
        </linearGradient>
      </defs>
      <circle cx="400" cy="225" r="155" fill="url(#ca)" opacity="0.22"/>
      <polygon points="400,65 550,225 400,385 250,225" fill="none" stroke="${cHigh}" stroke-width="5" opacity="0.85"/>
      <text x="400" y="232" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="44" letter-spacing="3" fill="#ffffff">${escapeSvg(titleLines[0]?.toUpperCase() ?? '')}</text>
    </svg>`;
    return { svg, width, height };
  }

  if (input.kind === 'fanart' || input.kind === 'landscape' || input.kind === 'thumb') {
    const width = 960;
    const height = 540;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <defs>
        <linearGradient id="fbg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#050811"/>
          <stop offset="55%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="#0a0f1d"/>
        </linearGradient>
        <radialGradient id="glow" cx="72%" cy="35%" r="55%">
          <stop offset="0%" stop-color="${cAccent}" stop-opacity="0.45"/>
          <stop offset="60%" stop-color="${cHigh}" stop-opacity="0.12"/>
          <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
        </radialGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#fbg)"/>
      <rect width="${width}" height="${height}" fill="url(#glow)"/>
      <circle cx="720" cy="190" r="190" fill="none" stroke="${cHigh}" stroke-opacity="0.22" stroke-width="2"/>
      <circle cx="720" cy="190" r="130" fill="none" stroke="${cAccent}" stroke-opacity="0.35" stroke-width="2"/>
      <path d="M 0 430 Q 320 350 640 420 T 960 380 L 960 540 L 0 540 Z" fill="#030712" opacity="0.6"/>
      ${input.episodeCode ? `<rect x="64" y="138" width="136" height="36" rx="8" fill="${cAccent}" opacity="0.9"/><text x="132" y="162" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="18" fill="#ffffff">${escapeSvg(input.episodeCode)}</text>` : ''}
      ${titleLines
        .slice(0, 2)
        .map((line, i) => {
          const y = (input.episodeCode ? 235 : 210) + i * 64;
          return `<text x="64" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="52" letter-spacing="1" fill="#f8fafc">${escapeSvg(line)}</text>`;
        })
        .join('')}
      ${subtitleText ? `<text x="64" y="365" font-family="DejaVu Sans, Arial, sans-serif" font-weight="500" font-size="22" fill="#cbd5e1">${subtitleText.slice(0, 58)}</text>` : ''}
      <text x="64" y="476" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="16" letter-spacing="4" fill="${cHigh}">${genreText}${yearText ? `  •  ${yearText}` : ''}</text>
      ${ratingBadge ? `<rect x="812" y="42" width="104" height="40" rx="10" fill="#0f172a" stroke="${cAccent}" stroke-width="2"/><text x="864" y="68" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="19" fill="#fbbf24">${escapeSvg(ratingBadge)}</text>` : ''}
    </svg>`;
    return { svg, width, height };
  }

  // Default: 2:3 Poster (500 x 750)
  const width = 500;
  const height = 750;
  const fontSize = titleLines.some((l) => l.length > 13) ? 40 : 48;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="pbg" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0%" stop-color="#070b14"/>
        <stop offset="45%" stop-color="${bg}"/>
        <stop offset="100%" stop-color="#03060c"/>
      </linearGradient>
      <radialGradient id="pglow" cx="50%" cy="32%" r="55%">
        <stop offset="0%" stop-color="${cAccent}" stop-opacity="0.5"/>
        <stop offset="55%" stop-color="${cHigh}" stop-opacity="0.16"/>
        <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#pbg)"/>
    <rect width="${width}" height="${height}" fill="url(#pglow)"/>
    <rect x="22" y="22" width="456" height="706" rx="12" fill="none" stroke="${cHigh}" stroke-opacity="0.22" stroke-width="2"/>
    <circle cx="250" cy="245" r="138" fill="none" stroke="${cAccent}" stroke-opacity="0.45" stroke-width="3"/>
    <circle cx="250" cy="245" r="98" fill="${cAccent}" fill-opacity="0.12" stroke="${cHigh}" stroke-opacity="0.3" stroke-width="1.5"/>
    <line x1="70" y1="245" x2="430" y2="245" stroke="${cHigh}" stroke-opacity="0.18" stroke-width="1.5"/>
    ${yearText ? `<rect x="44" y="44" width="84" height="32" rx="8" fill="#0b0f17" fill-opacity="0.78" stroke="${cAccent}" stroke-width="1.5"/><text x="86" y="66" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="16" fill="#e2e8f0">${escapeSvg(yearText)}</text>` : ''}
    ${ratingBadge ? `<rect x="364" y="44" width="92" height="32" rx="8" fill="#0b0f17" fill-opacity="0.82" stroke="#f59e0b" stroke-width="1.5"/><text x="410" y="66" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="16" fill="#fbbf24">${escapeSvg(ratingBadge)}</text>` : ''}
    ${input.seasonNumber !== undefined ? `<rect x="175" y="130" width="150" height="34" rx="17" fill="${cAccent}"/><text x="250" y="153" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="16" letter-spacing="2" fill="#ffffff">${input.seasonNumber === 0 ? 'SPECIALS' : `SEASON ${String(input.seasonNumber).padStart(2, '0')}`}</text>` : ''}
    <text x="250" y="448" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="700" font-size="13" letter-spacing="3.5" fill="${cHigh}">${genreText}</text>
    ${titleLines
      .map((line, i) => {
        const y = 510 + i * (fontSize + 8);
        return `<text x="250" y="${y}" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="800" font-size="${fontSize}" fill="#f8fafc">${escapeSvg(line)}</text>`;
      })
      .join('')}
    ${subtitleText ? `<text x="250" y="695" text-anchor="middle" font-family="DejaVu Sans, Arial, sans-serif" font-weight="500" font-size="15" fill="#94a3b8">${subtitleText.slice(0, 44)}</text>` : ''}
  </svg>`;
  return { svg, width, height };
}

export function renderArtworkBuffer(input: ArtworkRenderInput, ext: '.jpg' | '.png' = '.jpg'): Buffer {
  const { svg } = buildArtworkSvg(input);
  const resvg = new Resvg(svg, { fitTo: { mode: 'original' } });
  const pngData = resvg.render().asPng();

  if (ext === '.png') {
    return Buffer.from(pngData);
  }

  // Convert RGBA PNG to real JPEG so .jpg files have valid JPEG bytes
  const parsed = PNG.sync.read(Buffer.from(pngData));
  const encoded = jpeg.encode(
    {
      data: parsed.data,
      width: parsed.width,
      height: parsed.height,
    },
    88
  );
  return Buffer.from(encoded.data);
}

export async function saveArtworkToDisk(
  targetPath: string,
  sourceUrl: string | null | undefined,
  fallbackInput: ArtworkRenderInput
): Promise<string> {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });

  // Attempt real remote image download if sourceUrl is http(s)
  if (sourceUrl && /^https?:\/\//i.test(sourceUrl)) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(sourceUrl, { signal: ctrl.signal });
      clearTimeout(timer);
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 200) {
          fs.writeFileSync(targetPath, buf);
          return targetPath;
        }
      }
    } catch {
      // Fall back to deterministic rendered artwork when offline/sandboxed
    }
  }

  const ext = path.extname(targetPath).toLowerCase() === '.png' ? '.png' : '.jpg';
  const rendered = renderArtworkBuffer(fallbackInput, ext);
  fs.writeFileSync(targetPath, rendered);
  return targetPath;
}
