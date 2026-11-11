import type { VocabularyTerm } from '../../shared/types.js';

export interface SuggestionMatch {
  term: VocabularyTerm;
  /** Where the typed text matched — used for ranking and highlighting. */
  matchAt: 'start' | 'word' | 'substring';
  score: number;
}

const WORD_BOUNDARY = /[\s\-_/:([]/;

/**
 * Find terms matching what the user has typed so far.
 *
 * Ranking, best first:
 *  1. exact prefix ("4k" → "4K HDR")
 *  2. word-boundary prefix ("hdr" → "4K HDR")
 *  3. substring anywhere ("atmo" → "Dolby Atmos")
 * with ties broken by how often the term is already used in the library, then
 * alphabetically, so the most common tags surface first.
 *
 * Terms already present in `existing` are never offered, and matching is
 * case-insensitive.
 */
export function matchSuggestions(
  terms: readonly VocabularyTerm[],
  query: string,
  existing: readonly string[] = [],
  limit = 8
): SuggestionMatch[] {
  const existingLower = new Set(existing.map((v) => v.trim().toLowerCase()));
  const q = query.trim().toLowerCase();
  const scored: SuggestionMatch[] = [];

  for (const term of terms) {
    const value = term.value;
    if (!value) continue;
    const lower = value.toLowerCase();
    if (existingLower.has(lower)) continue;

    // An exact match is already in the list; suppress it rather than offering a no-op add.
    if (q && lower === q) continue;

    let matchAt: SuggestionMatch['matchAt'] | null = null;
    if (!q) matchAt = 'start';
    else if (lower.startsWith(q)) matchAt = 'start';
    else {
      const idx = lower.indexOf(q);
      if (idx > 0) {
        const before = lower[idx - 1];
        matchAt = WORD_BOUNDARY.test(before) ? 'word' : 'substring';
      }
    }
    if (!matchAt) continue;

    const rank = matchAt === 'start' ? 3 : matchAt === 'word' ? 2 : 1;
    // Shorter terms are more likely what the user meant when several share a prefix.
    const lengthPenalty = q ? Math.min(lower.length - q.length, 40) * 0.01 : 0;
    scored.push({ term, matchAt, score: rank * 1000 + Math.min(term.count, 500) - lengthPenalty });
  }

  scored.sort((a, b) => b.score - a.score || a.term.value.localeCompare(b.term.value));
  return scored.slice(0, limit);
}

/** Split a term into the part that matched the query and the remainder, for highlighting. */
export function splitHighlight(value: string, query: string): { before: string; hit: string; after: string } {
  const q = query.trim().toLowerCase();
  if (!q) return { before: '', hit: '', after: value };
  const idx = value.toLowerCase().indexOf(q);
  if (idx < 0) return { before: '', hit: '', after: value };
  return { before: value.slice(0, idx), hit: value.slice(idx, idx + q.length), after: value.slice(idx + q.length) };
}
