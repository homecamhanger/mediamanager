import React, { useState } from 'react';
import { Film, ImageOff } from 'lucide-react';
import { getArtworkUrl } from '../lib/api.js';

interface PosterImageProps {
  filePath: string | null | undefined;
  alt: string;
  className?: string;
  aspect?: 'poster' | 'fanart' | 'banner' | 'square' | 'logo';
  cacheKey?: string | number;
}

export const PosterImage: React.FC<PosterImageProps> = ({
  filePath,
  alt,
  className = '',
  aspect = 'poster',
  cacheKey,
}) => {
  const [failed, setFailed] = useState(false);
  const url = getArtworkUrl(filePath, cacheKey);

  const aspectClass =
    aspect === 'poster'
      ? 'aspect-[2/3]'
      : aspect === 'fanart'
        ? 'aspect-video'
        : aspect === 'banner'
          ? 'aspect-[1000/185]'
          : aspect === 'square'
            ? 'aspect-square'
            : 'aspect-[800/310]';

  if (!url || failed) {
    return (
      <div
        className={`${aspectClass} bg-slate-900/90 border border-slate-800 rounded-lg flex flex-col items-center justify-center text-slate-600 p-3 text-center ${className}`}
      >
        {filePath ? <ImageOff className="w-6 h-6 mb-1.5 opacity-60" /> : <Film className="w-6 h-6 mb-1.5 opacity-50" />}
        <span className="text-[11px] leading-tight line-clamp-2 text-slate-500">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={alt}
      onError={() => setFailed(true)}
      className={`${aspectClass} ${aspect === 'logo' ? 'object-contain' : 'object-cover'} rounded-lg bg-slate-900 ${className}`}
      loading="lazy"
    />
  );
};
