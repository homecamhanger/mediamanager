import React, { useEffect, useState } from 'react';
import { Clapperboard, Layers, Plus, Save, Trash2, X } from 'lucide-react';
import type { MovieRecord, MovieSetRecord } from '../../shared/types.js';
import { api, getArtworkUrl } from '../lib/api.js';
import { PosterImage } from './PosterImage.js';

export const SetDetailPanel: React.FC<{
  setRecord: MovieSetRecord;
  allMovies: MovieRecord[];
  onSelectMovie: (movieId: number) => void;
  onUpdated: () => Promise<void> | void;
  onDeleted: () => void;
}> = ({ setRecord, allMovies, onSelectMovie, onUpdated, onDeleted }) => {
  const [name, setName] = useState(setRecord.name);
  const [overview, setOverview] = useState(setRecord.overview);
  const [assignMovieId, setAssignMovieId] = useState('');
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    setName(setRecord.name);
    setOverview(setRecord.overview);
    setAssignMovieId('');
  }, [setRecord.id, setRecord.name, setRecord.overview]);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2600);
  };

  const unassignedMovies = allMovies.filter((m) => m.setId !== setRecord.id);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      await api.updateSet(setRecord.id, { name: name.trim(), overview });
      await onUpdated();
      notify('Set updated & member movie NFOs refreshed');
    } finally {
      setSaving(false);
    }
  };

  const handleAssign = async () => {
    if (!assignMovieId) return;
    await api.batchMovies('assignSet', [Number(assignMovieId)], { setName: setRecord.name });
    setAssignMovieId('');
    await onUpdated();
    notify('Movie added to collection');
  };

  const handleRemoveMovie = async (movieId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    await api.updateMovie(movieId, { setName: null, writeNfo: true });
    await onUpdated();
    notify('Removed movie from set');
  };

  const handleDelete = async () => {
    await api.deleteSet(setRecord.id);
    await onUpdated();
    onDeleted();
  };

  const setPoster = setRecord.posterPath ?? setRecord.movies.find((m) => m.artwork.poster)?.artwork.poster ?? null;
  const setFanart = setRecord.fanartPath ?? setRecord.movies.find((m) => m.artwork.fanart)?.artwork.fanart ?? null;
  const setFanartUrl = getArtworkUrl(setFanart);

  return (
    <div className="flex flex-col h-full min-h-0 overflow-y-auto">
      {/* Header with Set Fanart Backdrop */}
      <div className="relative border-b border-slate-800 shrink-0">
        {setFanartUrl && (
          <div
            className="absolute inset-0 bg-cover bg-center opacity-20"
            style={{ backgroundImage: `url("${setFanartUrl}")` }}
          />
        )}
        <div className="relative bg-gradient-to-r from-[#0b0f17]/95 via-[#0f1522]/85 to-[#0f1522]/80 px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/35 flex items-center justify-center text-amber-300">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">{setRecord.name}</h2>
              <p className="text-xs text-slate-400">
                {setRecord.movies.length} film{setRecord.movies.length === 1 ? '' : 's'} · Syncs Kodi{' '}
                <code className="text-sky-300">&lt;set&gt;</code> tags across movie NFO files
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {toast && (
              <span className="text-xs text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-2.5 py-1 rounded-md">
                {toast}
              </span>
            )}
            <button
              onClick={handleDelete}
              className="px-2.5 py-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Set
            </button>
          </div>
        </div>
      </div>

      <div className="p-4 @xl:p-5 space-y-5 @container">
        {/* Top Row: Collection Poster + Edit Name & Overview */}
        <div className="grid grid-cols-1 @2xl:grid-cols-[168px_minmax(0,1fr)] gap-4 items-start">
          <div className="w-32 @2xl:w-full shrink-0 mx-auto @2xl:mx-0">
            <div className="p-2.5 rounded-xl bg-slate-900/75 border border-slate-800 space-y-1.5">
              <div className="text-[11px] font-bold text-slate-300">Collection Poster</div>
              <PosterImage filePath={setPoster} alt={setRecord.name} aspect="poster" className="w-full" />
            </div>
          </div>

          <form onSubmit={handleSave} className="min-w-0 p-4 rounded-xl bg-slate-900/70 border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 @3xl:grid-cols-3 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Collection Name
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                />
              </div>
              <div className="@3xl:col-span-2">
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Kodi Set Overview
                </label>
                <textarea
                  rows={3}
                  value={overview}
                  onChange={(e) => setOverview(e.target.value)}
                  placeholder="Collection description stored in <set><overview>..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <div className="flex items-center gap-2">
                <select
                  value={assignMovieId}
                  onChange={(e) => setAssignMovieId(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 max-w-xs"
                >
                  <option value="">Assign movie to this set...</option>
                  {unassignedMovies.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.title} {m.year ? `(${m.year})` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleAssign}
                  disabled={!assignMovieId}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1 cursor-pointer disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" /> Assign
                </button>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-3.5 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save Set & Refresh NFOs'}
              </button>
            </div>
          </form>
        </div>

        {/* Member Movies Grid */}
        <div>
        <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2.5 flex items-center gap-1.5">
          <Clapperboard className="w-3.5 h-3.5 text-sky-400" /> Collection Movies ({setRecord.movies.length})
        </h3>
        {setRecord.movies.length === 0 ? (
          <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-500">
            No movies assigned to this set yet. Use the dropdown above to assign movies.
          </div>
        ) : (
          <div className="grid grid-cols-2 @xl:grid-cols-3 @3xl:grid-cols-4 @5xl:grid-cols-5 gap-3">
            {setRecord.movies
              .slice()
              .sort((a, b) => (a.year ?? 0) - (b.year ?? 0))
              .map((m) => (
                <div
                  key={m.id}
                  onClick={() => onSelectMovie(m.id)}
                  className="group relative rounded-xl bg-slate-900 border border-slate-800 hover:border-sky-500/60 overflow-hidden cursor-pointer transition"
                >
                  <button
                    onClick={(e) => handleRemoveMovie(m.id, e)}
                    title="Remove from set"
                    className="absolute top-1.5 right-1.5 z-10 p-1 rounded-md bg-black/70 text-slate-300 hover:text-rose-300 opacity-0 group-hover:opacity-100 transition cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <PosterImage filePath={m.artwork.poster} alt={m.title} />
                  <div className="p-2">
                    <div className="text-xs font-bold text-slate-100 truncate">{m.title}</div>
                    <div className="text-[11px] text-slate-400 flex items-center justify-between mt-0.5">
                      <span>{m.year ?? '—'}</span>
                      <span className={m.hasNfo ? 'text-emerald-400' : 'text-rose-400'}>
                        {m.hasNfo ? 'NFO' : 'No NFO'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
