import React, { useEffect, useState } from 'react';
import { ArrowUp, Folder, FolderOpen, X } from 'lucide-react';
import { api } from '../lib/api.js';
import { useEscapeKey } from '../lib/useEscapeKey.js';

interface FolderBrowserModalProps {
  open: boolean;
  initialPath?: string;
  onSelect: (dirPath: string) => void;
  onClose: () => void;
}

export const FolderBrowserModal: React.FC<FolderBrowserModalProps> = ({ open, initialPath, onSelect, onClose }) => {
  const [currentPath, setCurrentPath] = useState(initialPath ?? '');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [dirs, setDirs] = useState<Array<{ name: string; path: string }>>([]);
  const [error, setError] = useState<string | null>(null);

  const load = async (target?: string) => {
    setError(null);
    try {
      const data = await api.browseFolder(target);
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setDirs(data.directories);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    if (open) load(initialPath || undefined);
  }, [open, initialPath]);

  useEscapeKey(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#111827] border border-slate-700 rounded-xl w-full max-w-lg shadow-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold text-slate-100">
            <FolderOpen className="w-4 h-4 text-sky-400" />
            Browse Server Directories
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-200 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex items-center gap-2">
            <button
              disabled={!parentPath}
              onClick={() => parentPath && load(parentPath)}
              className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs flex items-center gap-1 disabled:opacity-40 cursor-pointer"
            >
              <ArrowUp className="w-3.5 h-3.5" /> Up
            </button>
            <input
              value={currentPath}
              onChange={(e) => setCurrentPath(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && load(currentPath)}
              className="flex-1 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 font-mono"
            />
            <button
              onClick={() => load(currentPath)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 cursor-pointer"
            >
              Go
            </button>
          </div>

          {error && <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">{error}</div>}

          <div className="h-64 overflow-y-auto border border-slate-800 rounded-lg bg-slate-950/60 divide-y divide-slate-800/60">
            {dirs.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">No subdirectories in this folder</div>
            ) : (
              dirs.map((d) => (
                <button
                  key={d.path}
                  onClick={() => load(d.path)}
                  className="w-full px-3 py-2 text-left text-sm text-slate-200 hover:bg-slate-800/80 flex items-center gap-2.5 cursor-pointer"
                >
                  <Folder className="w-4 h-4 text-sky-400 shrink-0" />
                  <span className="truncate">{d.name}</span>
                </button>
              ))
            )}
          </div>
        </div>

        <div className="px-4 py-3 border-t border-slate-800 flex justify-end gap-2 bg-slate-900/60">
          <button onClick={onClose} className="px-3 py-1.5 rounded-lg bg-slate-800 text-slate-300 text-xs font-medium cursor-pointer">
            Cancel
          </button>
          <button
            onClick={() => {
              onSelect(currentPath);
              onClose();
            }}
            className="px-4 py-1.5 rounded-lg bg-sky-500 hover:bg-sky-400 text-white text-xs font-semibold cursor-pointer"
          >
            Select This Folder
          </button>
        </div>
      </div>
    </div>
  );
};
