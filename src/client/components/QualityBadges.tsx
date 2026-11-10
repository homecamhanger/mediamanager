import React from 'react';
import type { ParsedFilenameInfo, StreamDetails } from '../../shared/types.js';

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
