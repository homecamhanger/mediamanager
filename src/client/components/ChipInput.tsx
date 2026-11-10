import React, { useState } from 'react';
import { Plus, X } from 'lucide-react';

interface ChipInputProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  suggestions?: string[];
  accent?: 'sky' | 'indigo' | 'emerald' | 'amber';
}

const CHIP_TONE: Record<NonNullable<ChipInputProps['accent']>, string> = {
  sky: 'bg-sky-500/15 text-sky-200 border-sky-500/35',
  indigo: 'bg-indigo-500/15 text-indigo-200 border-indigo-500/35',
  emerald: 'bg-emerald-500/15 text-emerald-200 border-emerald-500/35',
  amber: 'bg-amber-500/15 text-amber-200 border-amber-500/35',
};

export const ChipInput: React.FC<ChipInputProps> = ({
  label,
  values,
  onChange,
  placeholder = 'Type & press Enter...',
  suggestions = [],
  accent = 'sky',
}) => {
  const [draft, setDraft] = useState('');

  const addValues = (rawText: string) => {
    const incoming = rawText
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (incoming.length === 0) return;
    const existingLower = new Set(values.map((v) => v.toLowerCase()));
    const next = [...values];
    for (const item of incoming) {
      if (!existingLower.has(item.toLowerCase())) {
        existingLower.add(item.toLowerCase());
        next.push(item);
      }
    }
    onChange(next);
    setDraft('');
  };

  const removeValue = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  const unusedSuggestions = suggestions.filter(
    (s) => !values.some((v) => v.toLowerCase() === s.toLowerCase())
  );

  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase font-semibold text-slate-400">{label}</div>
      <div className="bg-slate-900 border border-slate-700/80 focus-within:border-sky-500/60 rounded-lg px-2 py-1.5 flex flex-wrap items-center gap-1.5">
        {values.map((val, idx) => (
          <span
            key={`${val}-${idx}`}
            className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-md border ${CHIP_TONE[accent]}`}
          >
            <span>{val}</span>
            <button
              type="button"
              onClick={() => removeValue(idx)}
              aria-label={`Remove ${val}`}
              className="hover:text-white opacity-75 hover:opacity-100"
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',') {
              e.preventDefault();
              addValues(draft);
            } else if (e.key === 'Backspace' && !draft && values.length > 0) {
              removeValue(values.length - 1);
            }
          }}
          onBlur={() => {
            if (draft.trim()) addValues(draft);
          }}
          placeholder={values.length === 0 ? placeholder : 'Add...'}
          className="flex-1 min-w-[110px] bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500 py-0.5"
        />
        {draft.trim() && (
          <button
            type="button"
            onClick={() => addValues(draft)}
            className="text-[11px] px-1.5 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white inline-flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        )}
      </div>
      {unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-slate-500 mr-0.5">Quick add:</span>
          {unusedSuggestions.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addValues(s)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/70"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
