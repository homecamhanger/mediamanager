import React, { useEffect, useState } from 'react';
import {
  Check,
  Download,
  FolderOpen,
  FolderPlus,
  HardDrive,
  ListMusic,
  RefreshCw,
  RotateCcw,
  Save,
  Server,
  Settings,
  Trash2,
} from 'lucide-react';
import type { AppPreferences, ArtworkKind, KodiRpcConfig, MediaSource } from '../../shared/types.js';
import { FolderBrowserModal } from '../components/FolderBrowserModal.js';
import { api } from '../lib/api.js';

const ALL_ARTWORK_KINDS: ArtworkKind[] = ['poster', 'fanart', 'clearlogo', 'clearart', 'disc', 'banner', 'landscape'];

export const SettingsPage: React.FC<{ onRefresh: () => void }> = ({ onRefresh }) => {
  const [sources, setSources] = useState<MediaSource[]>([]);
  const [prefs, setPrefs] = useState<AppPreferences | null>(null);
  const [kodi, setKodi] = useState<KodiRpcConfig | null>(null);

  // Add source form
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newKind, setNewKind] = useState<'movie' | 'tvshow'>('movie');
  const [browseOpen, setBrowseOpen] = useState(false);

  // Smart playlist & sources XML
  const [playlistName, setPlaylistName] = useState('Top Rated 4K Movies');
  const [playlistGenre, setPlaylistGenre] = useState('');
  const [playlistMinRating, setPlaylistMinRating] = useState('8.0');
  const [playlist4k, setPlaylist4k] = useState(true);
  const [generatedXml, setGeneratedXml] = useState('');

  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [sRes, pRes, kRes] = await Promise.all([api.listSources(), api.getPreferences(), api.getKodiConfig()]);
    setSources(sRes.sources);
    setPrefs(pRes);
    setKodi(kRes);
  };

  useEffect(() => {
    void load();
  }, []);

  const notify = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(null), 3500);
  };

  const handleAddSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newPath.trim()) return;
    setBusy(true);
    try {
      await api.addSource({
        name: newName.trim(),
        path: newPath.trim(),
        mediaKind: newKind,
        nfoNaming: prefs?.defaultNfoNaming ?? 'movie.nfo',
        artworkNaming: prefs?.defaultArtworkNaming ?? 'folder',
      });
      setNewName('');
      setNewPath('');
      await load();
      onRefresh();
      notify('Media source added & scanned');
    } finally {
      setBusy(false);
    }
  };

  const handleSavePrefs = async () => {
    if (!prefs) return;
    await api.savePreferences(prefs);
    notify('Kodi preferences saved');
  };

  const handleSaveKodi = async () => {
    if (!kodi) return;
    await api.saveKodiConfig(kodi);
    notify('Kodi JSON-RPC settings saved');
  };

  const handleTestKodi = async () => {
    if (!kodi) return;
    await api.saveKodiConfig(kodi);
    const res = await api.testKodiRpc();
    await load();
    notify(res.ok ? 'Connected to Kodi JSON-RPC!' : `Kodi connection check: ${res.status}`);
  };

  const handleGeneratePlaylist = async () => {
    const res = await api.generateSmartPlaylist({
      name: playlistName,
      type: 'movies',
      genre: playlistGenre || undefined,
      minRating: playlistMinRating ? Number(playlistMinRating) : undefined,
      resolution: playlist4k ? '2160p' : undefined,
      orderBy: 'rating',
    });
    setGeneratedXml(res.xml);
  };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Settings className="w-6 h-6 text-sky-400" /> Media Sources, Preferences & Kodi Integration
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Configure movie/TV folders, NFO & artwork naming rules, Kodi JSON-RPC library control, and Smart Playlist export.
          </p>
        </div>
        <button
          onClick={async () => {
            setBusy(true);
            try {
              await api.resetSampleLibrary();
              await load();
              onRefresh();
              notify('Sample Kodi library reset & re-indexed');
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-semibold text-slate-200 flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-amber-400" /> Reset Demo Sample Library
        </button>
      </div>

      {msg && (
        <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs text-emerald-300 flex items-center gap-2">
          <Check className="w-4 h-4" /> {msg}
        </div>
      )}

      {/* Media Sources */}
      <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4">
        <div className="flex items-center gap-2 text-base font-bold text-white">
          <HardDrive className="w-5 h-5 text-sky-400" /> Media Sources (Library Folders)
        </div>

        <div className="space-y-2">
          {sources.map((s) => (
            <div key={s.id} className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div>
                <div className="flex items-center gap-2">
                  <span className="px-2 py-0.5 rounded bg-sky-500/15 text-sky-300 font-bold uppercase text-[10px]">{s.mediaKind}</span>
                  <span className="font-bold text-slate-100">{s.name}</span>
                </div>
                <div className="font-mono text-slate-400 mt-0.5">{s.path}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={async () => {
                    await api.scanSources(s.id);
                    onRefresh();
                    notify(`Rescanned "${s.name}"`);
                  }}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" /> Scan
                </button>
                <button
                  onClick={async () => {
                    await api.deleteSource(s.id);
                    await load();
                    onRefresh();
                  }}
                  className="p-1.5 rounded-lg text-rose-400 hover:bg-rose-500/15 cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddSource} className="grid grid-cols-1 md:grid-cols-12 gap-2.5 pt-2 border-t border-slate-800 text-xs">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Source label (e.g. NAS 4K Movies)"
            className="md:col-span-3 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
          />
          <div className="md:col-span-5 flex gap-1.5">
            <input
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              placeholder="/path/to/media/folder"
              className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 font-mono text-slate-100"
            />
            <button
              type="button"
              onClick={() => setBrowseOpen(true)}
              className="px-2.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center gap-1 cursor-pointer"
            >
              <FolderOpen className="w-4 h-4 text-sky-400" /> Browse
            </button>
          </div>
          <select
            value={newKind}
            onChange={(e) => setNewKind(e.target.value as 'movie' | 'tvshow')}
            className="md:col-span-2 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-100"
          >
            <option value="movie">Movies</option>
            <option value="tvshow">TV Shows</option>
          </select>
          <button
            type="submit"
            disabled={busy}
            className="md:col-span-2 px-3 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold flex items-center justify-center gap-1 cursor-pointer"
          >
            <FolderPlus className="w-4 h-4" /> Add Source
          </button>
        </form>
      </div>

      {/* Preferences & Kodi RPC */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {prefs && (
          <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Kodi NFO & Artwork Preferences</h3>
              <button
                onClick={handleSavePrefs}
                className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Movie NFO Naming</label>
                <select
                  value={prefs.defaultNfoNaming}
                  onChange={(e) => setPrefs({ ...prefs, defaultNfoNaming: e.target.value as AppPreferences['defaultNfoNaming'] })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-200"
                >
                  <option value="movie.nfo">movie.nfo (dedicated folder)</option>
                  <option value="filename.nfo">&lt;videofilename&gt;.nfo</option>
                </select>
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Artwork Naming</label>
                <select
                  value={prefs.defaultArtworkNaming}
                  onChange={(e) => setPrefs({ ...prefs, defaultArtworkNaming: e.target.value as AppPreferences['defaultArtworkNaming'] })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-2 text-slate-200"
                >
                  <option value="folder">poster.jpg / fanart.jpg</option>
                  <option value="filename">&lt;videoname&gt;-poster.jpg</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1.5">Artwork Types to Scrape & Download</label>
              <div className="flex flex-wrap gap-1.5">
                {ALL_ARTWORK_KINDS.map((k) => {
                  const active = prefs.downloadArtworkKinds.includes(k);
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() =>
                        setPrefs({
                          ...prefs,
                          downloadArtworkKinds: active
                            ? prefs.downloadArtworkKinds.filter((x) => x !== k)
                            : [...prefs.downloadArtworkKinds, k],
                        })
                      }
                      className={`px-2.5 py-1 rounded-lg border font-semibold capitalize cursor-pointer ${
                        active ? 'bg-sky-500/20 border-sky-500/40 text-sky-300' : 'bg-slate-900 border-slate-800 text-slate-400'
                      }`}
                    >
                      {k}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">
                Preferred Subtitle Languages (comma separated ISO codes)
              </label>
              <input
                value={prefs.preferredSubtitleLanguages.join(', ')}
                onChange={(e) =>
                  setPrefs({
                    ...prefs,
                    preferredSubtitleLanguages: e.target.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean),
                  })
                }
                className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
              />
            </div>

            <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={prefs.autoWriteNfoOnScrape}
                onChange={(e) => setPrefs({ ...prefs, autoWriteNfoOnScrape: e.target.checked })}
              />
              Automatically write NFO XML immediately after scraping
            </label>
          </div>
        )}

        {kodi && (
          <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Server className="w-4 h-4 text-sky-400" /> Kodi JSON-RPC Bridge
              </h3>
              <button
                onClick={handleSaveKodi}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1 cursor-pointer"
              >
                <Save className="w-3.5 h-3.5" /> Save
              </button>
            </div>

            <div className="grid grid-cols-3 gap-2.5">
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Kodi Host / IP</label>
                <input
                  value={kodi.host}
                  onChange={(e) => setKodi({ ...kodi, host: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Port</label>
                <input
                  type="number"
                  value={kodi.port}
                  onChange={(e) => setKodi({ ...kodi, port: Number(e.target.value) })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100 font-mono"
                />
              </div>
              <div>
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Username</label>
                <input
                  value={kodi.username}
                  onChange={(e) => setKodi({ ...kodi, username: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Password</label>
                <input
                  type="password"
                  value={kodi.password}
                  onChange={(e) => setKodi({ ...kodi, password: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-100"
                />
              </div>
            </div>

            {kodi.lastStatus && (
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800 text-[11px] text-slate-300">
                Status: <span className="text-sky-300">{kodi.lastStatus}</span>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={handleTestKodi}
                className="px-3 py-1.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/30 border border-sky-500/40 text-sky-300 font-semibold cursor-pointer"
              >
                Test Connection
              </button>
              <button
                onClick={async () => {
                  const r = await api.triggerKodiScan();
                  notify(r.ok ? 'Triggered Kodi VideoLibrary.Scan' : `Kodi RPC: ${r.error}`);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
              >
                Trigger Library Scan
              </button>
              <button
                onClick={async () => {
                  const r = await api.triggerKodiClean();
                  notify(r.ok ? 'Triggered Kodi VideoLibrary.Clean' : `Kodi RPC: ${r.error}`);
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
              >
                Clean Kodi Library
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Exports & Smart Playlist */}
      <div className="p-5 rounded-2xl bg-[#111827] border border-slate-800 space-y-4 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <ListMusic className="w-4 h-4 text-amber-400" /> Export & Kodi Smart Playlist (.xsp) Generator
          </h3>
          <div className="flex flex-wrap gap-2">
            <a
              href="/api/export/json"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export JSON
            </a>
            <a
              href="/api/export/csv"
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold flex items-center gap-1"
            >
              <Download className="w-3.5 h-3.5" /> Export CSV
            </a>
            <button
              onClick={async () => {
                const res = await api.getSourcesXml();
                setGeneratedXml(res.xml);
              }}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold cursor-pointer"
            >
              Preview sources.xml
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-2.5 items-end">
          <div className="md:col-span-2">
            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Playlist Name</label>
            <input
              value={playlistName}
              onChange={(e) => setPlaylistName(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Genre Filter</label>
            <input
              value={playlistGenre}
              onChange={(e) => setPlaylistGenre(e.target.value)}
              placeholder="e.g. Science Fiction"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100"
            />
          </div>
          <div>
            <label className="block text-[10px] font-semibold uppercase text-slate-400 mb-1">Min Rating</label>
            <input
              value={playlistMinRating}
              onChange={(e) => setPlaylistMinRating(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-100"
            />
          </div>
          <button
            onClick={handleGeneratePlaylist}
            className="px-3 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white font-bold cursor-pointer"
          >
            Generate .xsp XML
          </button>
        </div>

        <label className="flex items-center gap-2 text-slate-300 cursor-pointer">
          <input type="checkbox" checked={playlist4k} onChange={(e) => setPlaylist4k(e.target.checked)} />
          4K UHD (&gt;1080p) Only
        </label>

        {generatedXml && (
          <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-[11px] font-mono text-emerald-200 overflow-x-auto">
            {generatedXml}
          </pre>
        )}
      </div>

      <FolderBrowserModal
        open={browseOpen}
        onSelect={(p) => setNewPath(p)}
        onClose={() => setBrowseOpen(false)}
      />
    </div>
  );
};
