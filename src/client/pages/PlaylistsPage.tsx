import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Check,
  ClipboardCopy,
  Download,
  Eye,
  ListMusic,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Sparkles,
  Trash2,
  Tv,
  X,
} from 'lucide-react';
import type {
  SmartPlaylistDefinition,
  SmartPlaylistField,
  SmartPlaylistFieldDef,
  SmartPlaylistOperator,
  SmartPlaylistPreview,
  SmartPlaylistPresetId,
  SmartPlaylistRecord,
  SmartPlaylistRule,
  SmartPlaylistType,
} from '../../shared/types.js';
import { api } from '../lib/api.js';

const OPERATOR_LABELS: Record<SmartPlaylistOperator, string> = {
  is: 'is',
  isnot: 'is not',
  contains: 'contains',
  doesnotcontain: 'does not contain',
  startswith: 'starts with',
  endswith: 'ends with',
  greaterthan: 'is greater than',
  lessthan: 'is less than',
  in: 'is one of',
  notin: 'is not one of',
  inthelast: 'in the last',
  notinthelast: 'not in the last',
};

const TYPE_LABELS: Record<SmartPlaylistType, string> = {
  movies: 'Movies',
  episodes: 'Episodes',
  tvshows: 'TV Shows',
};

let localRuleSeq = 0;
const makeRule = (field: SmartPlaylistField, operator: SmartPlaylistOperator, value = ''): SmartPlaylistRule => {
  localRuleSeq += 1;
  return { id: `draft${Date.now().toString(36)}${localRuleSeq}`, field, operator, value };
};

const BLANK_DEFINITION: SmartPlaylistDefinition = {
  name: 'New Smart Playlist',
  type: 'movies',
  match: 'all',
  rules: [],
  order: { by: 'title', direction: 'descending' },
  limit: null,
};

const inputCls =
  'bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-sky-500/70';

export const PlaylistsPage: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const [fields, setFields] = useState<SmartPlaylistFieldDef[]>([]);
  const [saved, setSaved] = useState<SmartPlaylistRecord[]>([]);
  const [presets, setPresets] = useState<
    Array<{ id: SmartPlaylistPresetId; label: string; description: string; ruleCount: number }>
  >([]);

  const [definition, setDefinition] = useState<SmartPlaylistDefinition>(BLANK_DEFINITION);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [preview, setPreview] = useState<SmartPlaylistPreview | null>(null);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showXml, setShowXml] = useState(false);
  const [listOpen, setListOpen] = useState(true);
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const notify = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const loadSaved = useCallback(async () => {
    const res = await api.listPlaylists();
    setSaved(res.playlists);
  }, []);

  useEffect(() => {
    (async () => {
      const [f, p, l] = await Promise.all([api.getPlaylistFields(), api.getPlaylistPresets(), api.listPlaylists()]);
      setFields(f.fields);
      setPresets(p.presets);
      setSaved(l.playlists);
    })().catch(() => notify('Failed to load playlist metadata'));
  }, []);

  // Debounced live preview: the whole point of the builder is seeing the rule
  // count change as you type, without hitting a "Preview" button.
  useEffect(() => {
    if (previewTimer.current) clearTimeout(previewTimer.current);
    previewTimer.current = setTimeout(async () => {
      setPreviewing(true);
      try {
        const res = await api.previewPlaylistDraft(definition);
        setPreview(res.preview);
        setValidationWarnings(res.validationWarnings);
      } catch {
        /* keep the last good preview on transient errors */
      } finally {
        setPreviewing(false);
      }
    }, 260);
    return () => {
      if (previewTimer.current) clearTimeout(previewTimer.current);
    };
  }, [definition]);

  const fieldsForType = useMemo(() => fields.filter((f) => f.supports.includes(definition.type)), [fields, definition.type]);

  const fieldByName = useMemo(() => new Map(fields.map((f) => [f.field, f])), [fields]);

  const patch = (partial: Partial<SmartPlaylistDefinition>) => setDefinition((d) => ({ ...d, ...partial }));

  const updateRule = (id: string, partial: Partial<SmartPlaylistRule>) =>
    setDefinition((d) => ({
      ...d,
      rules: d.rules.map((r) => {
        if (r.id !== id) return r;
        const next = { ...r, ...partial };
        // Keep the operator valid when the field changes to a different kind.
        if (partial.field && partial.field !== r.field) {
          const def = fieldByName.get(partial.field);
          if (def && !def.operators.includes(next.operator)) next.operator = def.operators[0];
          next.value = '';
        }
        return next;
      }),
    }));

  const addRule = () => {
    const def = fieldsForType[0];
    if (!def) return;
    patch({ rules: [...definition.rules, makeRule(def.field, def.operators[0])] });
  };

  const removeRule = (id: string) => patch({ rules: definition.rules.filter((r) => r.id !== id) });

  const applyPreset = async (id: SmartPlaylistPresetId) => {
    const res = await api.getPlaylistPreset(id);
    setDefinition(res.definition);
    setEditingId(null);
    notify(`Loaded preset: ${res.definition.name}`);
  };

  const startNew = () => {
    setDefinition({ ...BLANK_DEFINITION, rules: [] });
    setEditingId(null);
    setPreview(null);
  };

  const editSaved = async (playlist: SmartPlaylistRecord) => {
    setDefinition({
      name: playlist.name,
      type: playlist.type,
      match: playlist.match,
      rules: playlist.rules.map((r) => ({ ...r })),
      order: { ...playlist.order },
      limit: playlist.limit ?? null,
    });
    setEditingId(playlist.id);
    setShowXml(false);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingId) {
        await api.updatePlaylist(editingId, definition);
        notify(`Updated "${definition.name}"`);
      } else {
        const res = await api.createPlaylist(definition);
        setEditingId(res.playlist.id);
        notify(`Saved "${res.playlist.name}"`);
      }
      await loadSaved();
      onRefresh();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: number, name: string) => {
    setBusyId(id);
    try {
      await api.deletePlaylist(id);
      if (editingId === id) startNew();
      await loadSaved();
      notify(`Deleted "${name}"`);
    } finally {
      setBusyId(null);
    }
  };

  const handleDuplicate = async (id: number) => {
    setBusyId(id);
    try {
      await api.duplicatePlaylist(id);
      await loadSaved();
      notify('Duplicated playlist');
    } finally {
      setBusyId(null);
    }
  };

  const handlePush = async (id: number) => {
    setBusyId(id);
    try {
      const res = await api.pushPlaylistToKodi(id);
      notify(
        res.ok
          ? `Pushed to Kodi (${res.method === 'json-rpc' ? 'JSON-RPC' : 'local profile'}): ${res.targetPath}`
          : `Push failed: ${res.error}`
      );
      await loadSaved();
    } catch (err) {
      notify((err as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  const handleCopyXml = async () => {
    if (!preview) return;
    try {
      await navigator.clipboard.writeText(preview.xml);
      notify('Copied .xsp XML to clipboard');
    } catch {
      notify('Clipboard unavailable — use “Show XML” and copy manually');
    }
  };

  const activeRules = definition.rules.filter((r) => r.value.trim() !== '');
  const count = preview?.totalCount ?? null;

  return (
    <div className="p-4 @xl:p-5 space-y-4 max-w-[1400px] mx-auto @container">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <ListMusic className="w-5 h-5 text-amber-400" /> Smart Playlists
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Build Kodi <span className="font-mono text-slate-300">.xsp</span> playlists from your library, preview the
            matches live, then push them straight into Kodi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={startNew}
            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> New Playlist
          </button>
          <button
            onClick={() => setListOpen((v) => !v)}
            className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 cursor-pointer"
          >
            <ListMusic className="w-3.5 h-3.5" /> Saved ({saved.length})
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 @5xl:grid-cols-[minmax(0,1fr)_320px] gap-4 items-start">
        {/* ---------------- Builder ---------------- */}
        <div className="space-y-3 min-w-0">
          {/* Presets */}
          <div className="p-3 rounded-xl bg-[#111827] border border-slate-800 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" /> Start from a preset
            </div>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => (
                <button
                  key={p.id}
                  onClick={() => applyPreset(p.id)}
                  title={p.description}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/50 text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer transition"
                >
                  {p.label}
                  {p.ruleCount > 0 && <span className="ml-1 text-slate-500">{p.ruleCount}</span>}
                </button>
              ))}
            </div>
          </div>

          {/* Definition */}
          <div className="p-3.5 rounded-xl bg-[#111827] border border-slate-800 space-y-3">
            <div className="grid grid-cols-1 @lg:grid-cols-[minmax(0,1fr)_130px_130px] gap-2.5">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Playlist Name
                </label>
                <input
                  value={definition.name}
                  onChange={(e) => patch({ name: e.target.value })}
                  className={`${inputCls} w-full`}
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Content
                </label>
                <select
                  value={definition.type}
                  onChange={(e) => patch({ type: e.target.value as SmartPlaylistType, rules: [] })}
                  className={`${inputCls} w-full cursor-pointer`}
                >
                  {(Object.keys(TYPE_LABELS) as SmartPlaylistType[]).map((t) => (
                    <option key={t} value={t}>
                      {TYPE_LABELS[t]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Match
                </label>
                <select
                  value={definition.match}
                  onChange={(e) => patch({ match: e.target.value as 'all' | 'one' })}
                  className={`${inputCls} w-full cursor-pointer`}
                >
                  <option value="all">All rules (AND)</option>
                  <option value="one">Any rule (OR)</option>
                </select>
              </div>
            </div>

            {/* Rules */}
            <div className="space-y-1.5 pt-1 border-t border-slate-800/80">
              <div className="flex items-center justify-between pt-1.5">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Filter Rules</span>
                <span className="text-[11px] text-slate-500">
                  {activeRules.length} active
                  {definition.rules.length !== activeRules.length && ` · ${definition.rules.length - activeRules.length} blank`}
                </span>
              </div>

              {definition.rules.length === 0 && (
                <div className="px-3 py-4 rounded-lg border border-dashed border-slate-800 text-center text-[11px] text-slate-500">
                  No rules yet — pick a preset above or add a rule. With no rules the playlist matches your whole
                  {definition.type === 'movies' ? ' movie' : definition.type === 'episodes' ? ' episode' : ' show'} library.
                </div>
              )}

              {definition.rules.map((rule, idx) => {
                const def = fieldByName.get(rule.field);
                const diag = preview?.rules.find((d) => d.ruleId === rule.id);
                const zeroHits = diag && diag.matchedCount === 0 && rule.value.trim() !== '';
                return (
                  <div key={rule.id} className="space-y-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="w-5 shrink-0 text-[10px] font-mono text-slate-500 text-right">{idx + 1}</span>
                      <select
                        value={rule.field}
                        onChange={(e) => updateRule(rule.id, { field: e.target.value as SmartPlaylistField })}
                        className={`${inputCls} cursor-pointer min-w-[150px]`}
                      >
                        {fieldsForType.map((f) => (
                          <option key={f.field} value={f.field}>
                            {f.label}
                          </option>
                        ))}
                        {!fieldsForType.some((f) => f.field === rule.field) && (
                          <option value={rule.field}>{fieldByName.get(rule.field)?.label ?? rule.field}</option>
                        )}
                      </select>
                      <select
                        value={rule.operator}
                        onChange={(e) => updateRule(rule.id, { operator: e.target.value as SmartPlaylistOperator })}
                        className={`${inputCls} cursor-pointer`}
                      >
                        {(def?.operators ?? []).map((op) => (
                          <option key={op} value={op}>
                            {OPERATOR_LABELS[op]}
                          </option>
                        ))}
                      </select>
                      {def?.kind === 'enum' && def.choices ? (
                        <select
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          className={`${inputCls} cursor-pointer flex-1 min-w-[120px]`}
                        >
                          <option value="">Choose…</option>
                          {def.choices.map((c) => (
                            <option key={c.value} value={c.value}>
                              {c.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={rule.value}
                          onChange={(e) => updateRule(rule.id, { value: e.target.value })}
                          placeholder={
                            def?.kind === 'date-days'
                              ? 'days, e.g. 30'
                              : def?.kind === 'number'
                                ? 'number'
                                : 'value'
                          }
                          type={def?.kind === 'number' || def?.kind === 'date-days' ? 'number' : 'text'}
                          className={`${inputCls} flex-1 min-w-[110px]`}
                        />
                      )}
                      {def?.unit && def.kind !== 'enum' && (
                        <span className="text-[10px] text-slate-500">{def.unit}</span>
                      )}
                      {diag && (
                        <span
                          title={`This rule matches ${diag.matchedCount} item(s) on its own`}
                          className={`px-1.5 py-0.5 rounded text-[10px] font-mono font-bold shrink-0 ${
                            zeroHits
                              ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                              : 'bg-slate-800/80 text-slate-400'
                          }`}
                        >
                          {diag.matchedCount}
                        </span>
                      )}
                      <button
                        onClick={() => removeRule(rule.id)}
                        aria-label="Remove rule"
                        className="p-1 rounded text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer shrink-0"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    {zeroHits && (
                      <div className="ml-6 text-[10px] text-rose-300/90 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" /> Nothing in the library matches this rule on its own.
                      </div>
                    )}
                    {def?.hint && <div className="ml-6 text-[10px] text-slate-500">{def.hint}</div>}
                  </div>
                );
              })}

              <button
                onClick={addRule}
                className="mt-1 px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/40 text-[11px] font-semibold text-sky-300 flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3 h-3" /> Add Rule
              </button>
            </div>

            {/* Sort + limit */}
            <div className="grid grid-cols-2 @3xl:grid-cols-4 gap-2.5 pt-2 border-t border-slate-800/80">
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Sort By
                </label>
                <select
                  value={definition.order.by}
                  onChange={(e) => patch({ order: { ...definition.order, by: e.target.value as never } })}
                  className={`${inputCls} w-full cursor-pointer`}
                >
                  <option value="title">Title</option>
                  <option value="rating">Rating</option>
                  <option value="year">Year</option>
                  <option value="dateadded">Date Added</option>
                  <option value="runtime">Runtime</option>
                  {definition.type !== 'tvshows' && <option value="playcount">Play Count</option>}
                  {definition.type === 'episodes' && <option value="episode">Episode</option>}
                  <option value="random">Random</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Direction
                </label>
                <select
                  value={definition.order.direction}
                  onChange={(e) => patch({ order: { ...definition.order, direction: e.target.value as never } })}
                  className={`${inputCls} w-full cursor-pointer`}
                >
                  <option value="ascending">Ascending</option>
                  <option value="descending">Descending</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1">
                  Limit
                </label>
                <input
                  type="number"
                  min={0}
                  value={definition.limit ?? ''}
                  onChange={(e) => patch({ limit: e.target.value ? Number(e.target.value) : null })}
                  placeholder="No limit"
                  className={`${inputCls} w-full`}
                />
              </div>
              <div className="flex items-end">
                <span className="text-[11px] text-slate-500">
                  Kodi file: <span className="font-mono text-slate-300">{preview?.kodiFileName ?? '—'}.xsp</span>
                </span>
              </div>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-800/80">
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving…' : editingId ? 'Save Changes' : 'Save Playlist'}
              </button>
              <button
                onClick={handleCopyXml}
                disabled={!preview}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              >
                <ClipboardCopy className="w-3.5 h-3.5" /> Copy .xsp
              </button>
              {editingId && (
                <>
                  <button
                    onClick={() => handlePush(editingId)}
                    disabled={busyId === editingId}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {busyId === editingId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Tv className="w-3.5 h-3.5" />}
                    Save &amp; Push to Kodi
                  </button>
                  <a
                    href={`/api/playlists/${editingId}/download`}
                    className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Download
                  </a>
                </>
              )}
              <button
                onClick={() => setShowXml((v) => !v)}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-semibold text-slate-300 flex items-center gap-1.5 cursor-pointer"
              >
                <Eye className="w-3.5 h-3.5" /> {showXml ? 'Hide' : 'Show'} XML
              </button>
              {editingId && (
                <span className="text-[11px] text-slate-500 ml-auto flex items-center gap-1">
                  <Check className="w-3 h-3 text-emerald-400" /> Editing saved playlist #{editingId}
                </span>
              )}
            </div>

            {(validationWarnings.length > 0 || (preview?.warnings.length ?? 0) > 0) && (
              <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[11px] text-amber-200 space-y-0.5">
                {validationWarnings.map((w, i) => (
                  <div key={`v${i}`}>• {w}</div>
                ))}
                {preview?.warnings.map((w, i) => (
                  <div key={`p${i}`}>• {w}</div>
                ))}
              </div>
            )}
          </div>

          {showXml && preview && (
            <pre className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-200 overflow-x-auto whitespace-pre">
              {preview.xml}
            </pre>
          )}
        </div>

        {/* ---------------- Preview + Saved ---------------- */}
        <div className="space-y-3 min-w-0">
          {/* Live count */}
          <div className="p-3.5 rounded-xl bg-[#111827] border border-slate-800 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Live Preview</span>
              {previewing && <Loader2 className="w-3.5 h-3.5 animate-spin text-sky-400" />}
            </div>
            <div className="flex items-baseline gap-1.5">
              <span
                className={`text-2xl font-bold tabular-nums ${
                  count === 0 ? 'text-rose-300' : 'text-white'
                }`}
              >
                {count ?? '—'}
              </span>
              <span className="text-xs text-slate-400">
                of {preview?.libraryCount ?? '—'} {TYPE_LABELS[definition.type].toLowerCase()}
              </span>
            </div>

            {preview && preview.items.length > 0 ? (
              <div className="max-h-[320px] overflow-y-auto rounded-lg border border-slate-800 divide-y divide-slate-800/70">
                {preview.items.map((item) => (
                  <div key={`${item.mediaType}-${item.id}`} className="px-2.5 py-1.5 flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] font-semibold text-slate-200 truncate">{item.title}</div>
                      <div className="text-[10px] text-slate-500 truncate">{item.subtitle}</div>
                    </div>
                    {item.rating != null && (
                      <span className="text-[10px] font-mono text-amber-300 shrink-0">{item.rating.toFixed(1)}</span>
                    )}
                    {item.resolution && (
                      <span className="text-[10px] font-mono text-sky-300 shrink-0">{item.resolution}</span>
                    )}
                  </div>
                ))}
                {preview.totalCount > preview.items.length && (
                  <div className="px-2.5 py-1.5 text-[10px] text-slate-500">
                    +{preview.totalCount - preview.items.length} more…
                  </div>
                )}
              </div>
            ) : (
              <div className="px-2.5 py-4 rounded-lg border border-dashed border-slate-800 text-center text-[11px] text-slate-500">
                {count === 0
                  ? 'Nothing matches these rules. Check the per-rule counts on the left.'
                  : 'Add a rule or pick a preset to see matches.'}
              </div>
            )}
          </div>

          {/* Saved playlists */}
          {listOpen && (
            <div className="p-3 rounded-xl bg-[#111827] border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Saved Playlists</span>
                <button
                  onClick={() => loadSaved().then(() => notify('Refreshed'))}
                  className="p-1 rounded text-slate-500 hover:text-sky-300 cursor-pointer"
                  aria-label="Refresh saved playlists"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
              </div>
              {saved.length === 0 && (
                <div className="text-[11px] text-slate-500 px-1 py-2">
                  Nothing saved yet. Build a playlist and hit “Save Playlist”.
                </div>
              )}
              <div className="space-y-1.5">
                {saved.map((p) => (
                  <div
                    key={p.id}
                    className={`p-2 rounded-lg border transition ${
                      editingId === p.id
                        ? 'bg-sky-500/10 border-sky-500/40'
                        : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-1.5">
                      <button onClick={() => editSaved(p)} className="min-w-0 flex-1 text-left cursor-pointer">
                        <div className="text-[11px] font-bold text-slate-100 truncate flex items-center gap-1">
                          {p.stale && (
                            <span
                              title="Rules changed since it was last pushed to Kodi"
                              className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"
                            />
                          )}
                          {p.name}
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-1.5">
                          <span>{TYPE_LABELS[p.type]}</span>
                          <span>·</span>
                          <span>{p.rules.filter((r) => r.value.trim()).length} rules</span>
                          {p.lastKnownCount != null && (
                            <>
                              <span>·</span>
                              <span className="text-slate-400">{p.lastKnownCount} items</span>
                            </>
                          )}
                        </div>
                      </button>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button
                          onClick={() => editSaved(p)}
                          title="Edit"
                          className="p-1 rounded text-slate-500 hover:text-sky-300 hover:bg-slate-800 cursor-pointer"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handlePush(p.id)}
                          disabled={busyId === p.id}
                          title="Push to Kodi"
                          className="p-1 rounded text-slate-500 hover:text-emerald-300 hover:bg-slate-800 cursor-pointer disabled:opacity-40"
                        >
                          {busyId === p.id ? (
                            <Loader2 className="w-3 h-3 animate-spin" />
                          ) : (
                            <Tv className="w-3 h-3" />
                          )}
                        </button>
                        <button
                          onClick={() => handleDuplicate(p.id)}
                          disabled={busyId === p.id}
                          title="Duplicate"
                          className="p-1 rounded text-slate-500 hover:text-slate-200 hover:bg-slate-800 cursor-pointer disabled:opacity-40"
                        >
                          <ClipboardCopy className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => handleDelete(p.id, p.name)}
                          disabled={busyId === p.id}
                          title="Delete"
                          className="p-1 rounded text-slate-500 hover:text-rose-300 hover:bg-rose-500/10 cursor-pointer disabled:opacity-40"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                    {p.lastExportedAt && (
                      <div className="text-[10px] text-slate-600 mt-0.5">
                        Last pushed {new Date(p.lastExportedAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-4 right-4 z-50 px-3.5 py-2 rounded-xl bg-sky-500 text-white text-xs font-bold shadow-xl shadow-sky-500/30 max-w-[420px]">
          {toast}
        </div>
      )}
    </div>
  );
};
