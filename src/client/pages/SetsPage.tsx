import React, { useState } from 'react';
import { Layers, Plus, Trash2 } from 'lucide-react';
import type { MovieRecord, MovieSetRecord } from '../../shared/types.js';
import { PosterImage } from '../components/PosterImage.js';
import { api } from '../lib/api.js';

export const SetsPage: React.FC<{
  sets: MovieSetRecord[];
  movies: MovieRecord[];
  onRefresh: () => void;
}> = ({ sets, movies, onRefresh }) => {
  const [newName, setNewName] = useState('');
  const [newOverview, setNewOverview] = useState('');
  const [assignMovieId, setAssignMovieId] = useState<Record<number, string>>({});

  const createSet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    await api.createSet(newName.trim(), newOverview.trim());
    setNewName('');
    setNewOverview('');
    onRefresh();
  };

  const assignMovie = async (setId: number, setName: string) => {
    const mid = Number(assignMovieId[setId]);
    if (!mid) return;
    await api.updateMovie(mid, { setName, writeNfo: true });
    setAssignMovieId((p) => ({ ...p, [setId]: '' }));
    onRefresh();
  };

  const removeMovieFromSet = async (movieId: number) => {
    await api.updateMovie(movieId, { setName: null, writeNfo: true });
    onRefresh();
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Layers className="w-6 h-6 text-amber-400" /> Movie Sets & Collections ({sets.length})
        </h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Kodi groups movies into collections via the <code>&lt;set&gt;&lt;name&gt;...&lt;/name&gt;&lt;/set&gt;</code> NFO element.
        </p>
      </div>

      <form onSubmit={createSet} className="p-4 rounded-2xl bg-[#111827] border border-slate-800 grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-4">
          <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">New Collection Name</label>
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="e.g. Christopher Nolan Sci-Fi Collection"
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
          />
        </div>
        <div className="md:col-span-6">
          <label className="block text-[11px] font-semibold uppercase text-slate-400 mb-1">Collection Overview</label>
          <input
            value={newOverview}
            onChange={(e) => setNewOverview(e.target.value)}
            placeholder="Optional Kodi <set><overview> description..."
            className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs text-slate-100"
          />
        </div>
        <div className="md:col-span-2">
          <button
            type="submit"
            className="w-full px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" /> Create Set
          </button>
        </div>
      </form>

      <div className="space-y-4">
        {sets.map((s) => {
          const unassigned = movies.filter((m) => m.setId !== s.id);
          return (
            <div key={s.id} className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-bold text-white">{s.name}</h3>
                  <p className="text-xs text-slate-400 mt-0.5">{s.overview || 'No overview yet.'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={assignMovieId[s.id] ?? ''}
                    onChange={(e) => setAssignMovieId((p) => ({ ...p, [s.id]: e.target.value }))}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  >
                    <option value="">Add movie to set...</option>
                    {unassigned.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} ({m.year ?? '?'})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => assignMovie(s.id, s.name)}
                    className="px-3 py-1.5 rounded-lg bg-sky-500/20 border border-sky-500/40 text-sky-300 text-xs font-semibold cursor-pointer"
                  >
                    Assign
                  </button>
                  <button
                    onClick={async () => {
                      await api.deleteSet(s.id);
                      onRefresh();
                    }}
                    className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                    title="Delete Set"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {s.movies.length === 0 ? (
                <div className="text-xs text-slate-500 italic">No movies assigned to this set yet.</div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                  {s.movies
                    .slice()
                    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
                    .map((m) => (
                      <div key={m.id} className="rounded-xl bg-slate-900 border border-slate-800 overflow-hidden group relative">
                        <PosterImage filePath={m.artwork.poster} alt={m.title} className="rounded-none w-full" />
                        <button
                          onClick={() => removeMovieFromSet(m.id)}
                          title="Remove from set"
                          className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/75 text-rose-300 text-[10px] opacity-0 group-hover:opacity-100 cursor-pointer"
                        >
                          Remove
                        </button>
                        <div className="p-2">
                          <div className="text-xs font-semibold text-slate-100 truncate">{m.title}</div>
                          <div className="text-[10px] text-slate-400">{m.year ?? '—'}</div>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
