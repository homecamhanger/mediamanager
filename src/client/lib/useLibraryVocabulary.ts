import { useEffect, useState } from 'react';
import type { LibraryVocabulary } from '../../shared/types.js';
import { api } from '../lib/api.js';

/**
 * Fetch (and cache for the session) the library's reusable term vocabulary.
 * Tag/genre/credit entry uses this so the same values get reused instead of
 * being retyped with different casing or spelling every time.
 */
let vocabularyPromise: Promise<LibraryVocabulary> | null = null;

export function useLibraryVocabulary(): LibraryVocabulary | null {
  const [vocabulary, setVocabulary] = useState<LibraryVocabulary | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!vocabularyPromise) {
      vocabularyPromise = api.getLibraryVocabulary().catch((err) => {
        // Allow a retry on the next mount rather than caching the failure forever.
        vocabularyPromise = null;
        throw err;
      });
    }
    vocabularyPromise
      .then((v) => {
        if (!cancelled) setVocabulary(v);
      })
      .catch(() => {
        if (!cancelled) setVocabulary(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return vocabulary;
}

/** Drop the cached snapshot so the next mount re-reads the library (after a scan/import). */
export function invalidateLibraryVocabulary(): void {
  vocabularyPromise = null;
}
