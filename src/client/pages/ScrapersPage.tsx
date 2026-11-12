import React, { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, KeyRound, RotateCw, Save, SearchCheck, Sparkles } from 'lucide-react';
import type { ScraperFieldMapping, ScraperProviderConfig, ScraperProviderId } from '../../shared/types.js';
import { api } from '../lib/api.js';

const FIELD_LABELS: Array<{ key: keyof ScraperFieldMapping; label: string; desc: string }> = [
  { key: 'title', label: 'Title & Original Title', desc: 'Preferred source order for primary localized titles' },
  { key: 'plot', label: 'Synopsis & Tagline', desc: 'Plot summary source preference' },
  { key: 'ratings', label: 'Multi-Source Ratings', desc: 'All enabled sources combine into Kodi <ratings> (IMDb, RT, MC, TMDb, Trakt)' },
  { key: 'cast', label: 'Cast & Crew', desc: 'Actors, roles, directors, writers' },
  { key: 'genres', label: 'Genres & Tags', desc: 'Genre classification & keywords' },
  { key: 'certification', label: 'MPAA / Content Rating', desc: 'Age certification badges' },
  { key: 'artwork', label: 'Posters, Fanart, ClearLOGO & DiscART', desc: 'Artwork candidate priority' },
  { key: 'episodeGuide', label: 'TV Episode Guides', desc: 'Season & episode titles, air dates, and stills' },
];

export const ScrapersPage: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const [providers, setProviders] = useState<ScraperProviderConfig[]>([]);
  const [mapping, setMapping] = useState<ScraperFieldMapping | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  // Without these the page rendered a header over an empty grid on first paint and
  // stayed that way forever if the fetch failed — indistinguishable from "no
  // scrapers configured", which is never actually true.
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await api.getScraperConfig();
      setProviders(res.providers);
      setMapping(res.fieldMapping);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not load scraper configuration');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const updateProvider = (id: ScraperProviderId, patch: Partial<ScraperProviderConfig>) => {
    setProviders((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  };

  const moveFieldProvider = (field: keyof ScraperFieldMapping, index: number, dir: -1 | 1) => {
    if (!mapping) return;
    const list = [...mapping[field]];
    const target = index + dir;
    if (target < 0 || target >= list.length) return;
    [list[index], list[target]] = [list[target], list[index]];
    setMapping({ ...mapping, [field]: list });
  };

  const handleSave = async () => {
    if (!mapping) return;
    setSaving(true);
    setSavedMsg(null);
    try {
      await api.saveScraperConfig(providers, mapping);
      onRefresh();
      setSavedMsg('Scraper profile & API keys saved');
      setTimeout(() => setSavedMsg(null), 2500);
    } catch (err) {
      // Previously this rejected unhandled and the click looked like a no-op.
      setLoadError(err instanceof Error ? err.message : 'Could not save scraper configuration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <SearchCheck className="w-6 h-6 text-sky-400" /> Scraper Sources & Field Mixer
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Combine TMDb, OMDb (IMDb / Rotten Tomatoes / Metacritic), TheTVDB, Fanart.tv, Trakt, plus keyless sources (TVmaze, Jikan/MAL, Apple iTunes, Wikipedia/Wikidata, and Built-in Catalog).
          </p>
        </div>
        <div className="flex items-center gap-3">
          {savedMsg && <span className="text-xs text-emerald-300 flex items-center gap-1"><Check className="w-3.5 h-3.5" /> {savedMsg}</span>}
          <button
            onClick={handleSave}
            disabled={saving || loading || Boolean(loadError) || !mapping}
            className="px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Scraper Profile'}
          </button>
        </div>
      </div>

      {loadError && (
        <div className="flex flex-wrap items-center gap-3 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/40">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-rose-200">Could not load scraper configuration</div>
            <div className="text-[11px] text-rose-300/80 break-words">{loadError}</div>
          </div>
          <button
            onClick={() => void load()}
            className="px-3 py-1.5 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Retry
          </button>
        </div>
      )}

      {/* Loading placeholders keep the layout from collapsing to nothing. */}
      {loading && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4" aria-busy="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="p-4 rounded-2xl border border-slate-800 bg-[#111827] space-y-3">
              <div className="h-3.5 w-40 rounded bg-slate-800 animate-pulse" />
              <div className="h-3 w-full rounded bg-slate-800/70 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-slate-800/70 animate-pulse" />
              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <div className="h-7 rounded-lg bg-slate-900 animate-pulse" />
                <div className="h-7 rounded-lg bg-slate-900 animate-pulse" />
              </div>
            </div>
          ))}
          <span className="sr-only">Loading scraper sources…</span>
        </div>
      )}

      {/* Providers Grid */}
      {!loading && !loadError && (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((p) => (
          <div
            key={p.id}
            className={`p-4 rounded-2xl border transition space-y-3 ${
              p.enabled ? 'bg-[#111827] border-slate-800' : 'bg-[#0d121d] border-slate-800/50 opacity-70'
            }`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-white">{p.name}</span>
                  {p.supports.map((s) => (
                    <span key={s} className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 text-[10px] uppercase font-semibold">
                      {s}
                    </span>
                  ))}
                </div>
                <p className="text-xs text-slate-400 mt-1">{p.description}</p>
              </div>
              <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer shrink-0">
                <input
                  type="checkbox"
                  checked={p.enabled}
                  onChange={(e) => updateProvider(p.id, { enabled: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-900"
                />
                Enabled
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
              {p.requiresKey ? (
                <div className="space-y-1.5">
                  <label className="text-[10px] font-semibold uppercase text-slate-400 flex items-center gap-1">
                    <KeyRound className="w-3 h-3" /> API Key / Token
                  </label>
                  <input
                    type="password"
                    value={p.apiKey}
                    onChange={(e) => updateProvider(p.id, { apiKey: e.target.value })}
                    placeholder={p.apiKey ? '••••••••' : 'Optional (uses demo catalog if blank)'}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                  />
                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={p.useDemoFallback}
                      onChange={(e) => updateProvider(p.id, { useDemoFallback: e.target.checked })}
                      className="rounded border-slate-700 bg-slate-900"
                    />
                    Demo fallback when key blank
                  </label>
                </div>
              ) : (
                <div className="flex items-center text-[11px] text-emerald-400 font-medium">
                  <Sparkles className="w-3.5 h-3.5 mr-1.5 shrink-0" />
                  <span>No API key required (always scraped when enabled)</span>
                </div>
              )}

              <div>
                <label className="text-[10px] font-semibold uppercase text-slate-400 block mb-1">Preferred Language</label>
                <input
                  value={p.language}
                  onChange={(e) => updateProvider(p.id, { language: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-200"
                />
              </div>
            </div>
          </div>
        ))}
      </div>
      )}

      {/* Field Precedence Matrix */}
      {mapping && (
        <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
          <div>
            <h3 className="text-base font-bold text-white">Multi-Source Field Precedence Matrix</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Reorder source priority per metadata field (left = highest priority). Ratings combine all enabled sources automatically.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {FIELD_LABELS.map((f) => (
              <div key={f.key} className="p-3.5 rounded-xl bg-slate-900/70 border border-slate-800 space-y-2">
                <div>
                  <div className="text-xs font-bold text-slate-100">{f.label}</div>
                  <div className="text-[11px] text-slate-400">{f.desc}</div>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {mapping[f.key].map((pid, idx) => (
                    <div
                      key={pid}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-950 border border-slate-800 text-[11px] text-slate-200"
                    >
                      <span className="text-sky-400 font-bold">{idx + 1}.</span>
                      <span className="uppercase font-semibold">{pid}</span>
                      <button
                        onClick={() => moveFieldProvider(f.key, idx, -1)}
                        disabled={idx === 0}
                        className="text-slate-500 hover:text-white disabled:opacity-25 cursor-pointer"
                      >
                        <ArrowUp className="w-3 h-3" />
                      </button>
                      <button
                        onClick={() => moveFieldProvider(f.key, idx, 1)}
                        disabled={idx === mapping[f.key].length - 1}
                        className="text-slate-500 hover:text-white disabled:opacity-25 cursor-pointer"
                      >
                        <ArrowDown className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
