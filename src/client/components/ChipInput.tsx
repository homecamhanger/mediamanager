import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import type { VocabularyTerm } from '../../shared/types.js';
import { matchSuggestions, splitHighlight } from '../lib/tagSuggest.js';

interface ChipInputProps {
  label: string;
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Static starter suggestions shown when nothing is typed. */
  suggestions?: string[];
  /** Live vocabulary from the library — drives the type-ahead dropdown. */
  vocabulary?: VocabularyTerm[];
  /** Hide the "Quick add" row (used when the dropdown already covers it). */
  hideQuickAdd?: boolean;
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
  vocabulary,
  hideQuickAdd = false,
  accent = 'sky',
}) => {
  const [draft, setDraft] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

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
    setActiveIdx(0);
  };

  const removeValue = (idx: number) => {
    onChange(values.filter((_, i) => i !== idx));
  };

  /**
   * Merge library vocabulary with the static starters so both feed the same
   * ranked list. Vocabulary entries carry usage counts; starters get a count of
   * 0 so they only win when nothing in the library matches.
   */
  const mergedTerms = useMemo<VocabularyTerm[]>(() => {
    if (!vocabulary) {
      return suggestions.map((value) => ({ value, count: 0, mediaTypes: [] }));
    }
    const seen = new Set(vocabulary.map((t) => t.value.toLowerCase()));
    const extras = suggestions
      .filter((s) => !seen.has(s.toLowerCase()))
      .map((value) => ({ value, count: 0, mediaTypes: [] }));
    return [...vocabulary, ...extras];
  }, [vocabulary, suggestions]);

  const matches = useMemo(
    () => matchSuggestions(mergedTerms, draft, values, 8),
    [mergedTerms, draft, values]
  );

  const showDropdown = open && matches.length > 0;

  // Close the popup on outside click so it doesn't trap the form.
  useEffect(() => {
    if (!showDropdown) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [showDropdown]);

  useEffect(() => {
    setActiveIdx(0);
  }, [draft]);

  const commitActive = () => {
    const pick = matches[activeIdx] ?? matches[0];
    if (!pick) {
      addValues(draft);
      return;
    }
    addValues(pick.term.value);
    inputRef.current?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (!showDropdown) {
        setOpen(true);
        return;
      }
      e.preventDefault();
      setActiveIdx((i) => (i + 1) % matches.length);
      return;
    }
    if (e.key === 'ArrowUp') {
      if (!showDropdown) return;
      e.preventDefault();
      setActiveIdx((i) => (i - 1 + matches.length) % matches.length);
      return;
    }
    if (e.key === 'Escape') {
      if (showDropdown) {
        e.preventDefault();
        setOpen(false);
      }
      return;
    }
    if (e.key === 'Tab' && showDropdown && draft.trim()) {
      // Tab accepts the highlighted suggestion — the fastest path for keyboard users.
      e.preventDefault();
      commitActive();
      return;
    }
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      // Enter takes the highlighted suggestion when the list is open, otherwise
      // commits the raw text (so brand-new tags are still one keystroke away).
      if (e.key === 'Enter' && showDropdown) commitActive();
      else addValues(draft);
      return;
    }
    if (e.key === 'Backspace' && !draft && values.length > 0) {
      removeValue(values.length - 1);
    }
  };

  const unusedSuggestions = suggestions.filter((s) => !values.some((v) => v.toLowerCase() === s.toLowerCase()));

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <div className="text-[11px] uppercase font-semibold text-slate-400">{label}</div>
        {vocabulary && vocabulary.length > 0 && (
          <span className="text-[10px] text-slate-500">{vocabulary.length} known</span>
        )}
      </div>

      <div ref={wrapRef} className="relative">
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
                className="hover:text-white opacity-75 hover:opacity-100 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={onKeyDown}
            onBlur={() => {
              // Delay so a click on a suggestion registers before the popup closes.
              window.setTimeout(() => {
                setOpen(false);
                if (draft.trim()) addValues(draft);
              }, 120);
            }}
            role="combobox"
            aria-expanded={showDropdown}
            aria-autocomplete="list"
            aria-controls={`${label}-suggestions`}
            placeholder={values.length === 0 ? placeholder : 'Add...'}
            className="flex-1 min-w-[110px] bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500 py-0.5"
          />
          {draft.trim() && (
            <button
              type="button"
              onClick={() => addValues(draft)}
              className="text-[11px] px-1.5 py-0.5 rounded bg-sky-600 hover:bg-sky-500 text-white inline-flex items-center gap-0.5 cursor-pointer"
            >
              <Plus className="w-3 h-3" /> Add
            </button>
          )}
        </div>

        {showDropdown && (
          <ul
            id={`${label}-suggestions`}
            role="listbox"
            className="absolute z-30 left-0 right-0 mt-1 max-h-56 overflow-y-auto rounded-lg bg-[#0f1724] border border-slate-700 shadow-2xl shadow-black/60 py-1"
          >
            {matches.map((m, i) => {
              const { before, hit, after } = splitHighlight(m.term.value, draft);
              return (
                <li key={m.term.value} role="option" aria-selected={i === activeIdx}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      addValues(m.term.value);
                      inputRef.current?.focus();
                    }}
                    onMouseEnter={() => setActiveIdx(i)}
                    className={`w-full text-left px-2.5 py-1.5 text-xs flex items-center gap-2 cursor-pointer ${
                      i === activeIdx ? 'bg-sky-500/20 text-white' : 'text-slate-200 hover:bg-slate-800/70'
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {before}
                      {hit && <mark className="bg-sky-400/25 text-sky-200 rounded px-0.5">{hit}</mark>}
                      {after}
                    </span>
                    {m.term.count > 0 && (
                      <span className="shrink-0 text-[10px] font-mono text-slate-500" title="Already used by">
                        {m.term.count}
                      </span>
                    )}
                    {m.term.mediaTypes.length === 1 && (
                      <span className="shrink-0 text-[9px] uppercase tracking-wide text-slate-500">
                        {m.term.mediaTypes[0] === 'movie' ? 'Film' : 'TV'}
                      </span>
                    )}
                    {i === activeIdx && <Check className="w-3 h-3 shrink-0 text-sky-300" />}
                  </button>
                </li>
              );
            })}
            {draft.trim() && !matches.some((m) => m.term.value.toLowerCase() === draft.trim().toLowerCase()) && (
              <li role="option" aria-selected={false} className="border-t border-slate-800/80 mt-1 pt-1">
                <button
                  type="button"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    addValues(draft);
                    inputRef.current?.focus();
                  }}
                  className="w-full text-left px-2.5 py-1.5 text-xs text-emerald-300 hover:bg-slate-800/70 flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3 h-3" /> Create new: <span className="font-semibold">{draft.trim()}</span>
                </button>
              </li>
            )}
          </ul>
        )}
      </div>

      {!hideQuickAdd && unusedSuggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <span className="text-[10px] text-slate-500 mr-0.5">Quick add:</span>
          {unusedSuggestions.slice(0, 6).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => addValues(s)}
              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/70 cursor-pointer"
            >
              + {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
