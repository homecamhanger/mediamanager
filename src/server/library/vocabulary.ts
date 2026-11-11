import type { LibraryVocabulary, MovieRecord, TvShowRecord, VocabularyTerm } from '../../shared/types.js';

type Accumulator = Map<string, { value: string; count: number; mediaTypes: Set<'movie' | 'tvshow'> }>;

/**
 * Merge one media type's values into a value→count accumulator, preserving the
 * first-seen casing so suggestions read the way the library was scraped.
 */
function accumulate(target: Accumulator, values: readonly string[], mediaType: 'movie' | 'tvshow') {
  for (const raw of values) {
    const value = raw.trim();
    if (!value) continue;
    const key = value.toLowerCase();
    const existing = target.get(key);
    if (existing) {
      existing.count += 1;
      existing.mediaTypes.add(mediaType);
      // All-caps variants ("IMAX" vs "imax") are usually the canonical spelling, so
      // prefer them; otherwise keep the first-seen casing and just expand the length.
      const isAllCaps = (v: string) => v === v.toUpperCase() && /[A-Z]/.test(v);
      if (isAllCaps(value) && !isAllCaps(existing.value)) existing.value = value;
      else if (value.length > existing.value.length) existing.value = value;
    } else {
      target.set(key, { value, count: 1, mediaTypes: new Set([mediaType]) });
    }
  }
}

function toTerms(acc: Accumulator): VocabularyTerm[] {
  return [...acc.values()]
    .map((t) => ({ value: t.value, count: t.count, mediaTypes: [...t.mediaTypes] }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/**
 * Build the reusable term vocabulary for the library. Tags are the headline use
 * case (free-form, so consistency matters most), but genres/studios/directors/
 * writers get the same treatment since they share identical entry friction.
 */
export function buildLibraryVocabulary(movies: MovieRecord[], shows: TvShowRecord[]): LibraryVocabulary {
  const tags: Accumulator = new Map();
  const genres: Accumulator = new Map();
  const studios: Accumulator = new Map();
  const directors: Accumulator = new Map();
  const writers: Accumulator = new Map();

  for (const m of movies) {
    accumulate(tags, m.tags, 'movie');
    accumulate(genres, m.genres, 'movie');
    accumulate(studios, m.studios, 'movie');
    accumulate(directors, m.directors, 'movie');
    accumulate(writers, m.writers, 'movie');
  }
  for (const s of shows) {
    accumulate(tags, s.tags, 'tvshow');
    accumulate(genres, s.genres, 'tvshow');
    if (s.studio) accumulate(studios, [s.studio], 'tvshow');
  }

  return {
    tags: toTerms(tags),
    genres: toTerms(genres),
    studios: toTerms(studios),
    directors: toTerms(directors),
    writers: toTerms(writers),
  };
}
