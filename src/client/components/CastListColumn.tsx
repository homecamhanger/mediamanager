import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Check,
  Edit3,
  Filter,
  ImagePlus,
  Plus,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import type { ActorEntry } from '../../shared/types.js';
import { getArtworkUrl } from '../lib/api.js';

interface CastListColumnProps {
  actors: ActorEntry[];
  label?: string;
  emptyText?: string;
  activeActor?: string | null;
  onSelectActor?: (actorName: string) => void;
  onSaveActors?: (actors: ActorEntry[]) => Promise<void> | void;
  onUploadActorThumb?: (actorName: string, dataBase64: string) => Promise<string>;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export const CastListColumn: React.FC<CastListColumnProps> = ({
  actors,
  label = 'Cast',
  emptyText = 'No cast scraped yet. Click “Scrape” or “Edit Cast” to add cast & crew.',
  activeActor = null,
  onSelectActor,
  onSaveActors,
  onUploadActorThumb,
}) => {
  const activeNorm = activeActor?.trim().toLowerCase() || '';
  const [failedThumbs, setFailedThumbs] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [draftActors, setDraftActors] = useState<ActorEntry[]>(actors);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingIdx, setUploadingIdx] = useState<number | null>(null);
  const [thumbBust, setThumbBust] = useState(Date.now());
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const targetIdxRef = useRef<number | null>(null);

  useEffect(() => {
    if (!editing) {
      setDraftActors(actors);
    }
  }, [actors, editing]);

  const startEdit = () => {
    setDraftActors(actors.map((a, idx) => ({ ...a, order: a.order ?? idx })));
    setNewName('');
    setNewRole('');
    setEditing(true);
  };

  const moveActor = (idx: number, delta: -1 | 1) => {
    const nextIdx = idx + delta;
    if (nextIdx < 0 || nextIdx >= draftActors.length) return;
    const copy = [...draftActors];
    const [picked] = copy.splice(idx, 1);
    copy.splice(nextIdx, 0, picked);
    setDraftActors(copy.map((a, i) => ({ ...a, order: i })));
  };

  const addDraftActor = () => {
    const name = newName.trim();
    if (!name) return;
    const next: ActorEntry[] = [
      ...draftActors,
      { name, role: newRole.trim(), order: draftActors.length },
    ];
    setDraftActors(next);
    setNewName('');
    setNewRole('');
  };

  const saveAll = async () => {
    if (!onSaveActors) return;
    setSaving(true);
    try {
      const normalized = draftActors
        .map((a, idx) => ({
          ...a,
          name: a.name.trim(),
          role: a.role.trim(),
          order: idx,
        }))
        .filter((a) => Boolean(a.name));
      await onSaveActors(normalized);
      setEditing(false);
    } finally {
      setSaving(false);
    }
  };

  const handlePortraitFile = (file: File | undefined) => {
    const idx = targetIdxRef.current;
    if (!file || idx === null || !onUploadActorThumb) return;
    const actor = draftActors[idx];
    if (!actor?.name.trim()) return;

    const reader = new FileReader();
    reader.onload = async () => {
      if (typeof reader.result !== 'string') return;
      setUploadingIdx(idx);
      try {
        const thumbPath = await onUploadActorThumb(actor.name.trim(), reader.result);
        setDraftActors((prev) => prev.map((a, i) => (i === idx ? { ...a, thumb: thumbPath } : a)));
        setFailedThumbs(new Set());
        setThumbBust(Date.now());
      } finally {
        setUploadingIdx(null);
        targetIdxRef.current = null;
      }
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-sky-400" /> {label} ({editing ? draftActors.length : actors.length})
        </div>
        <div className="flex items-center gap-2">
          {!editing && onSelectActor && actors.length > 0 && (
            <div className="text-[11px] text-slate-400 hidden sm:block">
              Click a cast member to filter across Movies, TV Shows, and Sets
            </div>
          )}
          {onSaveActors && !editing && (
            <button
              type="button"
              onClick={startEdit}
              className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs inline-flex items-center gap-1.5"
            >
              <Edit3 className="w-3.5 h-3.5 text-sky-400" /> Edit Cast
            </button>
          )}
          {editing && (
            <>
              <button
                type="button"
                onClick={() => setEditing(false)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs inline-flex items-center gap-1"
              >
                <X className="w-3.5 h-3.5" /> Cancel
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => void saveAll()}
                className="px-2.5 py-1 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium inline-flex items-center gap-1"
              >
                <Check className="w-3.5 h-3.5" /> {saving ? 'Saving...' : 'Save Cast'}
              </button>
            </>
          )}
        </div>
      </div>

      {editing ? (
        <div className="space-y-2.5 bg-slate-900/70 border border-slate-800 rounded-xl p-3">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => {
              handlePortraitFile(e.target.files?.[0]);
              e.target.value = '';
            }}
          />

          {draftActors.length === 0 && (
            <div className="text-xs text-slate-500 py-3 text-center">
              No cast entries yet. Add a cast member below.
            </div>
          )}

          <div className="space-y-1.5">
            {draftActors.map((a, idx) => {
              const thumbUrl = a.thumb ? getArtworkUrl(a.thumb, thumbBust) : null;
              return (
                <div
                  key={idx}
                  className="bg-slate-950/70 border border-slate-800 rounded-lg p-2 flex flex-wrap sm:flex-nowrap items-center gap-2"
                >
                  <button
                    type="button"
                    disabled={!onUploadActorThumb || !a.name.trim() || uploadingIdx === idx}
                    onClick={() => {
                      targetIdxRef.current = idx;
                      fileInputRef.current?.click();
                    }}
                    title={onUploadActorThumb ? 'Upload .actors portrait image' : 'Portrait preview'}
                    className="w-9 h-9 rounded-full shrink-0 overflow-hidden border border-slate-700 hover:border-sky-400 bg-slate-800 flex items-center justify-center text-[11px] font-bold text-slate-300 relative group"
                  >
                    {thumbUrl && !failedThumbs.has(thumbUrl) ? (
                      <img
                        src={thumbUrl}
                        alt={a.name}
                        onError={() => setFailedThumbs((prev) => new Set([...prev, thumbUrl]))}
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span>{getInitials(a.name)}</span>
                    )}
                    {onUploadActorThumb && (
                      <span className="absolute inset-0 bg-slate-950/65 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                        <ImagePlus className="w-3.5 h-3.5 text-sky-300" />
                      </span>
                    )}
                  </button>

                  <span className="text-[11px] font-mono text-slate-500 w-6 text-center shrink-0">#{idx + 1}</span>

                  <input
                    value={a.name}
                    onChange={(e) =>
                      setDraftActors((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, name: e.target.value } : item))
                      )
                    }
                    placeholder="Actor name"
                    className="flex-1 min-w-[140px] bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-100"
                  />
                  <input
                    value={a.role}
                    onChange={(e) =>
                      setDraftActors((prev) =>
                        prev.map((item, i) => (i === idx ? { ...item, role: e.target.value } : item))
                      )
                    }
                    placeholder="Character / Role"
                    className="flex-1 min-w-[140px] bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
                  />

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => moveActor(idx, -1)}
                      title="Move up"
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-300"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === draftActors.length - 1}
                      onClick={() => moveActor(idx, 1)}
                      title="Move down"
                      className="p-1 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-35 text-slate-300"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setDraftActors((prev) =>
                          prev.filter((_, i) => i !== idx).map((item, i) => ({ ...item, order: i }))
                        )
                      }
                      title="Remove cast member"
                      className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="pt-2 border-t border-slate-800 flex flex-wrap sm:flex-nowrap items-center gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDraftActor();
                }
              }}
              placeholder="New actor name..."
              className="flex-1 min-w-[140px] bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-100"
            />
            <input
              value={newRole}
              onChange={(e) => setNewRole(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDraftActor();
                }
              }}
              placeholder="Role (e.g. Mark Scout)"
              className="flex-1 min-w-[140px] bg-slate-950 border border-slate-700 rounded px-2.5 py-1.5 text-xs text-slate-200"
            />
            <button
              type="button"
              onClick={addDraftActor}
              disabled={!newName.trim()}
              className="px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-sky-300 border border-slate-700 text-xs inline-flex items-center gap-1 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" /> Add Actor
            </button>
          </div>
          {onUploadActorThumb && (
            <div className="text-[11px] text-slate-400">
              Tip: Click any actor avatar above to upload a local image straight into Kodi&apos;s <span className="font-mono text-slate-300">.actors/</span> folder.
            </div>
          )}
        </div>
      ) : actors.length === 0 ? (
        <div className="text-xs text-slate-500 bg-slate-900/60 border border-slate-800 rounded-xl p-6 text-center">
          {emptyText}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5">
          {actors.map((a, idx) => {
            const isActive = Boolean(activeNorm && a.name.trim().toLowerCase() === activeNorm);
            const thumbUrl = a.thumb ? getArtworkUrl(a.thumb, thumbBust) : null;
            const showImg = Boolean(thumbUrl && !failedThumbs.has(thumbUrl));

            return (
              <button
                key={`${a.name}-${idx}`}
                type="button"
                onClick={() => onSelectActor?.(a.name)}
                disabled={!onSelectActor}
                title={
                  onSelectActor
                    ? isActive
                      ? `Filtered by ${a.name} (click to clear)`
                      : `Filter movies & TV shows by ${a.name}`
                    : undefined
                }
                className={`group w-full text-left p-2.5 rounded-xl border flex items-center gap-3 transition ${
                  isActive
                    ? 'bg-sky-500/20 border-sky-500/60 text-white shadow-sm shadow-sky-500/10'
                    : 'bg-slate-900/80 border-slate-800 hover:bg-slate-800/80 hover:border-sky-500/40'
                } ${onSelectActor ? 'cursor-pointer' : ''}`}
              >
                <div
                  className={`w-10 h-10 rounded-full shrink-0 overflow-hidden border flex items-center justify-center text-xs font-bold ${
                    isActive
                      ? 'border-sky-400/70 bg-sky-500/30 text-sky-100'
                      : 'border-slate-700 bg-slate-800 text-slate-300'
                  }`}
                >
                  {showImg && thumbUrl ? (
                    <img
                      src={thumbUrl}
                      alt={a.name}
                      loading="lazy"
                      onError={() => setFailedThumbs((prev) => new Set([...prev, thumbUrl]))}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span>{getInitials(a.name)}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div
                    className={`text-xs font-bold truncate ${
                      isActive ? 'text-sky-100' : 'text-slate-100 group-hover:text-sky-200'
                    }`}
                  >
                    {a.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5">
                    {a.role ? `as ${a.role}` : 'Cast'}
                  </div>
                </div>

                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className="text-[10px] font-mono text-slate-500">#{a.order + 1}</span>
                  {onSelectActor && (
                    <Filter
                      className={`w-3 h-3 transition ${
                        isActive ? 'text-sky-300 opacity-100' : 'text-sky-400 opacity-0 group-hover:opacity-100'
                      }`}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};
