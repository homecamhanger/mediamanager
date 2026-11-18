/**
 * Wires folder proposals to the rename patterns and the real move engine.
 *
 * The proposal engine is deliberately free of the renamer's dependencies, so this
 * module is the single place that knows both. Destination names come from the
 * *current* rename patterns rather than a second, parallel convention: a film that
 * gets a folder this way lands exactly where the renamer would have put it.
 */

import path from 'node:path';
import type {
  FolderProposal,
  FolderProposalReport,
  MediaSource,
  MovieRecord,
  RenamePatternsConfig,
} from '../../shared/types.js';
import { MediaDatabase } from '../db/database.js';
import { renderRenameTemplate, sanitizeFilenamePart } from './renamerEngine.js';
import { buildFolderProposals, proposalToPreview } from './folderProposals.js';
import { RenamerEngine } from './renamerEngine.js';

export class FolderProposalService {
  private renamer: RenamerEngine;

  constructor(private db: MediaDatabase) {
    this.renamer = new RenamerEngine(db);
  }

  /** Current proposals, computed fresh. Nothing is written. */
  build(): FolderProposalReport {
    const cfg = this.renamer.getPatterns();
    return buildFolderProposals(this.db, (movie, source) => this.renderTargets(movie, source, cfg));
  }

  /**
   * Same tokens and templates `previewMovieRename` uses, so the proposed folder is
   * identical to what an ordinary rename would produce for this film.
   */
  private renderTargets(
    movie: MovieRecord,
    source: MediaSource,
    cfg: RenamePatternsConfig,
  ): { folderName: string; fileBase: string } {
    const tokens = this.renamer.buildMovieTokens(movie);
    const folderName = renderRenameTemplate(cfg.movieFolderPattern, tokens, cfg) || movie.title;
    const fileBase = renderRenameTemplate(cfg.movieFilePattern, tokens, cfg) || movie.title;
    return { folderName, fileBase };
  }

  /**
   * Applies approved proposals through the normal rename path.
   *
   * Only ids the user approved are acted on, and each is re-derived from live state
   * at apply time — a film whose folder changed between review and approval must not
   * be moved to a destination computed from stale data.
   */
  apply(movieIds: number[]): {
    batchId: string | null;
    movedCount: number;
    skippedCount: number;
    errors: string[];
    applied: Array<{ movieId: number; title: string; targetFolder: string }>;
  } {
    const approved = new Set(movieIds);
    const report = this.build();
    const chosen = report.proposals.filter(
      (p) => approved.has(p.movieId) && !p.conflict && !p.blockedReason,
    );

    if (chosen.length === 0) {
      return { batchId: null, movedCount: 0, skippedCount: 0, errors: [], applied: [] };
    }

    // The renamer's own executor handles sidecars, DB updates, history and undo.
    const result = this.renamer.executeRename(chosen.map(proposalToPreview), true);

    return {
      ...result,
      applied: chosen.map((p) => ({ movieId: p.movieId, title: p.title, targetFolder: p.targetFolder })),
    };
  }

  /**
   * Rescans the sources the approved films live in.
   *
   * After a move the stored paths are already correct, but the artwork that was
   * ambiguous before can now be re-attributed: a film alone in its own folder picks
   * up a bare `poster.jpg` legitimately. That is the point of the whole exercise, so
   * the rescan is not optional bookkeeping.
   */
  sourcesForMovies(movieIds: number[]): number[] {
    const ids = new Set<number>();
    for (const movieId of movieIds) {
      const m = this.db.getMovie(movieId);
      if (m) ids.add(m.sourceId);
    }
    return [...ids];
  }
}

/** Human-facing description of a proposal's destination, for logs and messages. */
export function describeProposal(p: FolderProposal): string {
  return `${p.title} → ${path.basename(p.targetFolder)}`;
}
