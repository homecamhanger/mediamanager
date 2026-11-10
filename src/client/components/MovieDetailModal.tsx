import React from 'react';
import { useEscapeKey } from '../lib/useEscapeKey.js';
import { MovieDetailPanel } from './MovieDetailPanel.js';

export const MovieDetailModal: React.FC<{
  movieId: number | null;
  onClose: () => void;
  onUpdated: () => void;
}> = ({ movieId, onClose, onUpdated }) => {
  useEscapeKey(movieId !== null, onClose);

  if (!movieId) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] bg-[#0f1522] border border-slate-700/80 rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <MovieDetailPanel movieId={movieId} onUpdated={onUpdated} onClose={onClose} />
      </div>
    </div>
  );
};
