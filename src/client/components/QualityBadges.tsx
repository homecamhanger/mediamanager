import React from 'react';
import { Check, Eye, FileCode2, Image as ImageIcon, Subtitles } from 'lucide-react';
import type { ParsedFilenameInfo, StreamDetails, SubtitleFileRecord } from '../../shared/types.js';

export const TechBadges: React.FC<{ parsed: ParsedFilenameInfo; streamDetails: StreamDetails }> = ({ parsed, streamDetails }) => {
  const v = streamDetails.video[0];
  const a = streamDetails.audio[0];
  const res =
    parsed.resolution ||
    (v?.height ? (v.height >= 2000 ? '2160p' : v.height >= 1000 ? '1080p' : v.height >= 700 ? '720p' : `${v.height}p`) : null);
  const vCodec = parsed.videoCodec || v?.codec;
  const aCodec = parsed.audioCodec || a?.codec;
  const hdr = parsed.hdr || v?.hdrType;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {res && (
        <span
          className={`px-1.5 py-0.5 rounded text-[10px] font-bold tracking-wide ${
            res.includes('2160')
              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
              : res.includes('1080')
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/30'
                : 'bg-slate-800 text-slate-300 border border-slate-700'
          }`}
        >
          {res === '2160p' ? '4K' : res.toUpperCase()}
        </span>
      )}
      {hdr && <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">{hdr}</span>}
      {vCodec && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800/90 text-slate-300 border border-slate-700/80">{vCodec}</span>}
      {aCodec && <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-slate-800/90 text-slate-400 border border-slate-700/80">{aCodec}</span>}
    </div>
  );
};

export const CompletenessPills: React.FC<{
  hasNfo: boolean;
  hasPoster: boolean;
  hasFanart?: boolean;
  subtitles: SubtitleFileRecord[];
  watched?: boolean;
}> = ({ hasNfo, hasPoster, hasFanart, subtitles, watched }) => {
  return (
    <div className="flex items-center gap-1">
      <span
        title={hasNfo ? 'Kodi NFO present' : 'Missing NFO'}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
          hasNfo ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
        }`}
      >
        <FileCode2 className="w-3 h-3" />
        NFO
      </span>
      <span
        title={hasPoster && (hasFanart ?? true) ? 'Artwork present' : 'Missing poster or fanart'}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
          hasPoster ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'
        }`}
      >
        <ImageIcon className="w-3 h-3" />
        ART
      </span>
      <span
        title={subtitles.length > 0 ? `Subtitles: ${subtitles.map((s) => s.language).join(', ')}` : 'No subtitles'}
        className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
          subtitles.length > 0 ? 'bg-sky-500/15 text-sky-300' : 'bg-slate-800 text-slate-500'
        }`}
      >
        <Subtitles className="w-3 h-3" />
        {subtitles.length > 0 ? subtitles.map((s) => s.language.toUpperCase()).slice(0, 2).join(',') : 'SUB'}
      </span>
      {watched && (
        <span title="Watched" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-semibold bg-purple-500/20 text-purple-300">
          <Eye className="w-3 h-3" />
          <Check className="w-2.5 h-2.5" />
        </span>
      )}
    </div>
  );
};
