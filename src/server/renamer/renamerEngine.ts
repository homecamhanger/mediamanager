import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  ArtworkKind,
  MovieRecord,
  RenameHistoryBatch,
  RenamePatternsConfig,
  RenamePreviewItem,
  RenameSidecarMove,
  TvEpisodeRecord,
  TvShowRecord,
} from '../../shared/types.js';
import { DEFAULT_RENAME_PATTERNS, MediaDatabase } from '../db/database.js';
import { isSubtitleFile } from '../subtitles/subtitleTools.js';

export function sanitizeFilenamePart(
  raw: string,
  colonReplacement: RenamePatternsConfig['colonReplacement'] = 'dash',
  spaceReplacement: RenamePatternsConfig['spaceReplacement'] = 'space'
): string {
  let s = raw;
  if (colonReplacement === 'dash') s = s.replace(/\s*:\s*/g, ' - ');
  else if (colonReplacement === 'space') s = s.replace(/\s*:\s*/g, ' ');
  else s = s.replace(/:/g, '');

  s = s.replace(/[\\/*?"<>|]/g, '');
  s = s.replace(/\s+/g, ' ').trim();

  if (spaceReplacement === 'dot') s = s.replace(/\s+/g, '.');
  else if (spaceReplacement === 'underscore') s = s.replace(/\s+/g, '_');

  return s.replace(/\.+$/, '').trim();
}

/**
 * Renders pattern templates supporting:
 * - Simple tokens: {title}, {year}, {imdb_id}, {resolution}
 * - Zero-padded integer tokens: {season:02d}, {episode:02d}
 * - Conditional wrapper blocks: { - {edition}}, { [imdbid-{imdb_id}]}, { [{resolution} {video_codec}]}
 *   If all inner tokens inside a conditional block evaluate to empty, the entire block is omitted.
 */
export function renderRenameTemplate(
  pattern: string,
  tokens: Record<string, string | number | null | undefined>,
  config: Pick<RenamePatternsConfig, 'colonReplacement' | 'spaceReplacement'>
): string {
  const resolveToken = (expr: string): string => {
    const [key, fmt] = expr.split(':');
    const val = tokens[key.trim()];
    if (val === null || val === undefined || val === '') return '';
    if (fmt && /^0\d+d$/.test(fmt)) {
      const width = Number(fmt.slice(1, -1));
      const num = Number(val);
      return Number.isNaN(num) ? String(val) : String(num).padStart(width, '0');
    }
    return String(val);
  };

  // Resolve conditional outer blocks containing nested {token} expressions first
  let output = '';
  let i = 0;
  while (i < pattern.length) {
    if (pattern[i] === '{') {
      // Find matching closing brace accounting for nested braces
      let depth = 1;
      let j = i + 1;
      while (j < pattern.length && depth > 0) {
        if (pattern[j] === '{') depth++;
        else if (pattern[j] === '}') depth--;
        j++;
      }
      const inner = pattern.slice(i + 1, j - 1);
      if (inner.includes('{')) {
        let nonEmptyCount = 0;
        const expanded = inner.replace(/\{([^{}]+)\}/g, (_, tok: string) => {
          const v = resolveToken(tok);
          if (v) nonEmptyCount++;
          return v;
        });
        if (nonEmptyCount > 0) {
          // Collapse duplicate spaces inside optional brackets like [2160p  AAC] -> [2160p AAC]
          output += expanded.replace(/\s{2,}/g, ' ').replace(/\[\s+/g, '[').replace(/\s+\]/g, ']');
        }
      } else {
        output += resolveToken(inner);
      }
      i = j;
    } else {
      output += pattern[i];
      i++;
    }
  }

  return sanitizeFilenamePart(output, config.colonReplacement, config.spaceReplacement);
}

export class RenamerEngine {
  constructor(private db: MediaDatabase) {}

  getPatterns(): RenamePatternsConfig {
    return this.db.getSetting<RenamePatternsConfig>('rename_patterns', DEFAULT_RENAME_PATTERNS);
  }

  private buildMovieTokens(m: MovieRecord): Record<string, string | number | null | undefined> {
    const v0 = m.streamDetails.video[0];
    const a0 = m.streamDetails.audio[0];
    const res =
      m.parsedInfo.resolution ||
      (v0?.height ? (v0.height >= 2000 ? '2160p' : v0.height >= 1000 ? '1080p' : v0.height >= 700 ? '720p' : `${v0.height}p`) : null);
    return {
      title: m.title,
      original_title: m.originalTitle || m.title,
      sort_title: m.sortTitle || m.title,
      year: m.year,
      imdb_id: m.uniqueIds.imdb,
      tmdb_id: m.uniqueIds.tmdb,
      collection: m.setName,
      resolution: res,
      source: m.parsedInfo.source || v0?.source,
      video_codec: m.parsedInfo.videoCodec || v0?.codec,
      audio_codec: m.parsedInfo.audioCodec || a0?.codec,
      audio_channels: a0?.channels ? (a0.channels >= 8 ? '7.1' : a0.channels >= 6 ? '5.1' : '2.0') : null,
      hdr: m.parsedInfo.hdr || v0?.hdrType,
      edition: m.parsedInfo.edition,
      release_group: m.parsedInfo.releaseGroup || v0?.releaseGroup,
    };
  }

  private buildEpisodeTokens(show: TvShowRecord, ep: TvEpisodeRecord): Record<string, string | number | null | undefined> {
    const v0 = ep.streamDetails.video[0];
    const a0 = ep.streamDetails.audio[0];
    const res =
      ep.parsedInfo.resolution ||
      (v0?.height ? (v0.height >= 2000 ? '2160p' : v0.height >= 1000 ? '1080p' : v0.height >= 700 ? '720p' : `${v0.height}p`) : null);
    const epPad = String(ep.episodeNumber).padStart(2, '0');
    const isMulti = ep.multiEpisodeEnd != null && ep.multiEpisodeEnd > ep.episodeNumber;
    const epRange = isMulti ? `${epPad}-E${String(ep.multiEpisodeEnd).padStart(2, '0')}` : epPad;
    return {
      show_title: show.title,
      title: ep.title,
      episode_title: ep.title,
      year: show.year,
      season: ep.seasonNumber,
      episode: ep.episodeNumber,
      episode_range: epRange,
      tvdb_id: show.uniqueIds.tvdb,
      tmdb_id: show.uniqueIds.tmdb,
      imdb_id: show.uniqueIds.imdb,
      resolution: res,
      source: ep.parsedInfo.source || v0?.source,
      video_codec: ep.parsedInfo.videoCodec || v0?.codec,
      audio_codec: ep.parsedInfo.audioCodec || a0?.codec,
      hdr: ep.parsedInfo.hdr || v0?.hdrType,
      release_group: ep.parsedInfo.releaseGroup || v0?.releaseGroup,
    };
  }

  previewMovieRename(movieIds: number[], overridePatterns?: Partial<RenamePatternsConfig>): RenamePreviewItem[] {
    const cfg = { ...this.getPatterns(), ...(overridePatterns ?? {}) };
    const previews: RenamePreviewItem[] = [];
    const seenTargets = new Set<string>();

    for (const id of movieIds) {
      const m = this.db.getMovie(id);
      if (!m) continue;
      const source = this.db.getSource(m.sourceId);
      if (!source) continue;

      const tokens = this.buildMovieTokens(m);
      const targetFolderName = renderRenameTemplate(cfg.movieFolderPattern, tokens, cfg) || m.title;
      const targetFileBase = renderRenameTemplate(cfg.movieFilePattern, tokens, cfg) || m.title;
      const ext = path.extname(m.filePath);

      const targetDir = path.join(source.path, targetFolderName);
      const newVideoPath = path.join(targetDir, `${targetFileBase}${ext}`);
      const oldBase = path.basename(m.filePath, ext);

      const sidecars: RenameSidecarMove[] = [];
      if (cfg.renameSidecarFiles) {
        // NFO
        if (m.nfoPath && fs.existsSync(m.nfoPath)) {
          const nfoName = path.basename(m.nfoPath) === 'movie.nfo' ? 'movie.nfo' : `${targetFileBase}.nfo`;
          const newNfo = path.join(targetDir, nfoName);
          if (newNfo !== m.nfoPath) sidecars.push({ kind: 'nfo', oldPath: m.nfoPath, newPath: newNfo });
        }

        // Subtitles
        for (const sub of m.subtitles) {
          if (!fs.existsSync(sub.filePath)) continue;
          const suffix = sub.fileName.startsWith(oldBase) ? sub.fileName.slice(oldBase.length) : `.${sub.language}.${sub.format}`;
          const newSubPath = path.join(targetDir, `${targetFileBase}${suffix}`);
          if (newSubPath !== sub.filePath) sidecars.push({ kind: 'subtitle', oldPath: sub.filePath, newPath: newSubPath });
        }

        // Artwork
        for (const [kind, artPath] of Object.entries(m.artwork)) {
          if (!artPath || !fs.existsSync(artPath)) continue;
          const artName = path.basename(artPath);
          const artExt = path.extname(artPath);
          const newArtName = artName.startsWith(`${oldBase}-`) ? `${targetFileBase}-${kind}${artExt}` : artName;
          const newArtPath = path.join(targetDir, newArtName);
          if (newArtPath !== artPath) sidecars.push({ kind: 'artwork', oldPath: artPath, newPath: newArtPath });
        }
      }

      const hasChanges = newVideoPath !== m.filePath || sidecars.length > 0;
      let conflict: string | null = null;
      if (newVideoPath !== m.filePath) {
        if (seenTargets.has(newVideoPath)) conflict = 'Duplicate target path in batch';
        else if (fs.existsSync(newVideoPath)) conflict = 'Target file already exists on disk';
        seenTargets.add(newVideoPath);
      }

      previews.push({
        mediaType: 'movie',
        mediaId: m.id,
        title: m.title,
        hasChanges,
        conflict,
        oldPath: m.filePath,
        newPath: newVideoPath,
        sidecars,
      });
    }
    return previews;
  }

  previewEpisodeRename(episodeIds: number[], overridePatterns?: Partial<RenamePatternsConfig>): RenamePreviewItem[] {
    const cfg = { ...this.getPatterns(), ...(overridePatterns ?? {}) };
    const previews: RenamePreviewItem[] = [];
    const seenTargets = new Set<string>();

    for (const id of episodeIds) {
      const ep = this.db.getTvEpisode(id);
      if (!ep) continue;
      const show = this.db.getTvShow(ep.showId);
      if (!show) continue;
      const source = this.db.getSource(show.sourceId);
      if (!source) continue;

      const tokens = this.buildEpisodeTokens(show, ep);
      const showFolderName = renderRenameTemplate(cfg.tvShowFolderPattern, tokens, cfg) || show.title;
      const seasonFolderName =
        ep.seasonNumber === 0
          ? cfg.specialsFolderName || 'Specials'
          : renderRenameTemplate(cfg.seasonFolderPattern, tokens, cfg) || `Season ${String(ep.seasonNumber).padStart(2, '0')}`;
      const epPattern =
        ep.multiEpisodeEnd != null &&
        ep.multiEpisodeEnd > ep.episodeNumber &&
        !cfg.episodeFilePattern.includes('{episode_range}')
          ? cfg.episodeFilePattern.replace(/\{episode(?::0\d+d)?\}/g, '{episode_range}')
          : cfg.episodeFilePattern;
      const epBase = renderRenameTemplate(epPattern, tokens, cfg) || `${show.title} - S${ep.seasonNumber}E${ep.episodeNumber}`;
      const ext = path.extname(ep.filePath);

      const targetDir = path.join(source.path, showFolderName, seasonFolderName);
      const newVideoPath = path.join(targetDir, `${epBase}${ext}`);
      const oldBase = path.basename(ep.filePath, ext);

      const sidecars: RenameSidecarMove[] = [];
      if (cfg.renameSidecarFiles) {
        if (ep.nfoPath && fs.existsSync(ep.nfoPath)) {
          const newNfo = path.join(targetDir, `${epBase}.nfo`);
          if (newNfo !== ep.nfoPath) sidecars.push({ kind: 'nfo', oldPath: ep.nfoPath, newPath: newNfo });
        }
        if (ep.thumbPath && fs.existsSync(ep.thumbPath)) {
          const newThumb = path.join(targetDir, `${epBase}-thumb${path.extname(ep.thumbPath)}`);
          if (newThumb !== ep.thumbPath) sidecars.push({ kind: 'artwork', oldPath: ep.thumbPath, newPath: newThumb });
        }
        for (const sub of ep.subtitles) {
          if (!fs.existsSync(sub.filePath)) continue;
          const suffix = sub.fileName.startsWith(oldBase) ? sub.fileName.slice(oldBase.length) : `.${sub.language}.${sub.format}`;
          const newSubPath = path.join(targetDir, `${epBase}${suffix}`);
          if (newSubPath !== sub.filePath) sidecars.push({ kind: 'subtitle', oldPath: sub.filePath, newPath: newSubPath });
        }
      }

      const hasChanges = newVideoPath !== ep.filePath || sidecars.length > 0;
      let conflict: string | null = null;
      if (newVideoPath !== ep.filePath) {
        if (seenTargets.has(newVideoPath)) conflict = 'Duplicate target path in batch';
        else if (fs.existsSync(newVideoPath)) conflict = 'Target file already exists on disk';
        seenTargets.add(newVideoPath);
      }

      previews.push({
        mediaType: 'episode',
        mediaId: ep.id,
        title: `${show.title} S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')} - ${ep.title}`,
        hasChanges,
        conflict,
        oldPath: ep.filePath,
        newPath: newVideoPath,
        sidecars,
      });
    }
    return previews;
  }

  executeRename(
    previews: RenamePreviewItem[],
    cleanupEmptyFolders = true
  ): { batchId: string; movedCount: number; skippedCount: number; errors: string[] } {
    const cfg = this.getPatterns();
    const shouldClean = cleanupEmptyFolders ?? cfg.cleanupEmptyFolders;
    const allMoves: RenameSidecarMove[] = [];
    const oldDirsToCheck = new Set<string>();
    const errors: string[] = [];
    let movedCount = 0;
    let skippedCount = 0;

    for (const item of previews) {
      if (!item.hasChanges || item.conflict) {
        skippedCount++;
        continue;
      }
      try {
        const oldDir = path.dirname(item.oldPath);
        const newDir = path.dirname(item.newPath);
        oldDirsToCheck.add(oldDir);
        fs.mkdirSync(newDir, { recursive: true });

        if (item.oldPath !== item.newPath && fs.existsSync(item.oldPath)) {
          moveFileSafe(item.oldPath, item.newPath);
          allMoves.push({ kind: 'video', oldPath: item.oldPath, newPath: item.newPath });
        }

        for (const sc of item.sidecars) {
          if (fs.existsSync(sc.oldPath) && sc.oldPath !== sc.newPath) {
            fs.mkdirSync(path.dirname(sc.newPath), { recursive: true });
            moveFileSafe(sc.oldPath, sc.newPath);
            allMoves.push(sc);
          }
        }

        // Update DB records
        if (item.mediaType === 'movie') {
          const m = this.db.getMovie(item.mediaId);
          if (m) {
            const newArtwork = { ...m.artwork };
            for (const sc of item.sidecars.filter((s) => s.kind === 'artwork')) {
              for (const [k, v] of Object.entries(newArtwork)) {
                if (v === sc.oldPath) newArtwork[k as ArtworkKind] = sc.newPath;
              }
            }
            const nfoMove = item.sidecars.find((s) => s.kind === 'nfo');
            this.db.updateMovie(m.id, {
              folderPath: newDir,
              filePath: item.newPath,
              fileName: path.basename(item.newPath),
              nfoPath: nfoMove ? nfoMove.newPath : m.nfoPath,
              artwork: newArtwork,
            });
            for (const subMove of item.sidecars.filter((s) => s.kind === 'subtitle')) {
              const existingSub = m.subtitles.find((s) => s.filePath === subMove.oldPath);
              if (existingSub) {
                this.db.deleteSubtitle(existingSub.id);
                this.db.addSubtitle({
                  ...existingSub,
                  filePath: subMove.newPath,
                  fileName: path.basename(subMove.newPath),
                });
              }
            }
          }
        } else {
          const ep = this.db.getTvEpisode(item.mediaId);
          if (ep) {
            const nfoMove = item.sidecars.find((s) => s.kind === 'nfo');
            const thumbMove = item.sidecars.find((s) => s.kind === 'artwork');
            this.db.updateTvEpisode(ep.id, {
              folderPath: newDir,
              filePath: item.newPath,
              fileName: path.basename(item.newPath),
              nfoPath: nfoMove ? nfoMove.newPath : ep.nfoPath,
              thumbPath: thumbMove ? thumbMove.newPath : ep.thumbPath,
            });
            for (const subMove of item.sidecars.filter((s) => s.kind === 'subtitle')) {
              const existingSub = ep.subtitles.find((s) => s.filePath === subMove.oldPath);
              if (existingSub) {
                this.db.deleteSubtitle(existingSub.id);
                this.db.addSubtitle({
                  ...existingSub,
                  filePath: subMove.newPath,
                  fileName: path.basename(subMove.newPath),
                });
              }
            }
            // Also if show folder changed, update show folder path & show artwork/nfo if nested
            const show = this.db.getTvShow(ep.showId);
            const showDirCandidate = path.dirname(newDir);
            if (show && oldDir !== newDir && fs.existsSync(show.folderPath) && show.folderPath !== showDirCandidate) {
              // Keep show folder intact unless all files moved; move show-level files only if old show folder became empty
              const source = this.db.getSource(show.sourceId);
              if (source && path.dirname(showDirCandidate) === source.path && showDirCandidate !== show.folderPath) {
                moveShowLevelAssetsIfNeeded(this.db, show, showDirCandidate);
              }
            }
          }
        }

        movedCount++;
      } catch (err) {
        errors.push(`${item.title}: ${(err as Error).message}`);
      }
    }

    if (shouldClean) {
      for (const dir of oldDirsToCheck) {
        removeEmptyDirChain(dir, 2);
      }
    }

    const batchId = crypto.randomUUID();
    if (allMoves.length > 0) {
      const types = new Set(previews.filter((p) => p.hasChanges && !p.conflict).map((p) => p.mediaType));
      const mediaType: RenameHistoryBatch['mediaType'] =
        types.size > 1 ? 'mixed' : types.has('episode') ? 'episode' : 'movie';
      this.db.recordRenameBatch({
        id: batchId,
        createdAt: new Date().toISOString(),
        mediaType,
        itemCount: movedCount,
        reverted: false,
        moves: allMoves,
      });
      this.db.logActivity('rename', 'Batch Rename', `Renamed ${movedCount} media items (${allMoves.length} files)`, 'success');
    }

    return { batchId, movedCount, skippedCount, errors };
  }

  revertBatch(batchId: string): { revertedFiles: number; errors: string[] } {
    const batch = this.db.getRenameBatch(batchId);
    if (!batch) throw new Error('Rename batch not found');
    if (batch.reverted) throw new Error('Rename batch already reverted');

    const errors: string[] = [];
    let revertedFiles = 0;

    // Reverse moves in opposite order
    for (const move of [...batch.moves].reverse()) {
      try {
        if (fs.existsSync(move.newPath)) {
          fs.mkdirSync(path.dirname(move.oldPath), { recursive: true });
          moveFileSafe(move.newPath, move.oldPath);
          removeEmptyDirChain(path.dirname(move.newPath), 2);
          revertedFiles++;

          if (move.kind === 'video') {
            const m = this.db.getMovieByPath(move.newPath);
            if (m) {
              this.db.updateMovie(m.id, {
                folderPath: path.dirname(move.oldPath),
                filePath: move.oldPath,
                fileName: path.basename(move.oldPath),
              });
            } else {
              const ep = this.db.listAllEpisodes().find((e) => e.filePath === move.newPath);
              if (ep) {
                this.db.updateTvEpisode(ep.id, {
                  folderPath: path.dirname(move.oldPath),
                  filePath: move.oldPath,
                  fileName: path.basename(move.oldPath),
                });
              }
            }
          } else if (move.kind === 'nfo') {
            const m = this.db.listMovies().find((x) => x.nfoPath === move.newPath);
            if (m) this.db.updateMovie(m.id, { nfoPath: move.oldPath });
            const ep = this.db.listAllEpisodes().find((x) => x.nfoPath === move.newPath);
            if (ep) this.db.updateTvEpisode(ep.id, { nfoPath: move.oldPath });
          } else if (move.kind === 'subtitle') {
            const sub = this.db.listAllSubtitles().find((s) => s.filePath === move.newPath);
            if (sub) {
              this.db.deleteSubtitle(sub.id);
              this.db.addSubtitle({ ...sub, filePath: move.oldPath, fileName: path.basename(move.oldPath) });
            }
          } else if (move.kind === 'artwork') {
            const m = this.db.listMovies().find((x) => Object.values(x.artwork).includes(move.newPath));
            if (m) {
              const art = { ...m.artwork };
              for (const [k, v] of Object.entries(art)) {
                if (v === move.newPath) art[k as ArtworkKind] = move.oldPath;
              }
              this.db.updateMovie(m.id, { artwork: art });
            }
            const ep = this.db.listAllEpisodes().find((x) => x.thumbPath === move.newPath);
            if (ep) this.db.updateTvEpisode(ep.id, { thumbPath: move.oldPath });
          }
        }
      } catch (err) {
        errors.push(`${move.newPath}: ${(err as Error).message}`);
      }
    }

    this.db.markRenameBatchReverted(batchId);
    this.db.logActivity('rename', 'Undo Rename', `Reverted ${revertedFiles} files from batch ${batchId.slice(0, 8)}`, 'info');
    return { revertedFiles, errors };
  }
}

function moveFileSafe(src: string, dest: string) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EXDEV') {
      fs.copyFileSync(src, dest);
      fs.unlinkSync(src);
    } else {
      throw err;
    }
  }
}

function removeEmptyDirChain(dir: string, maxLevels: number) {
  let cur = dir;
  for (let i = 0; i < maxLevels; i++) {
    if (!fs.existsSync(cur)) break;
    try {
      const entries = fs.readdirSync(cur);
      if (entries.length === 0) {
        fs.rmdirSync(cur);
        cur = path.dirname(cur);
      } else {
        break;
      }
    } catch {
      break;
    }
  }
}

function moveShowLevelAssetsIfNeeded(db: MediaDatabase, show: TvShowRecord, newShowDir: string) {
  const oldShowDir = show.folderPath;
  if (!fs.existsSync(oldShowDir)) return;
  fs.mkdirSync(newShowDir, { recursive: true });
  const newArtwork = { ...show.artwork };
  for (const [k, v] of Object.entries(newArtwork)) {
    if (v && fs.existsSync(v) && path.dirname(v) === oldShowDir) {
      const dest = path.join(newShowDir, path.basename(v));
      moveFileSafe(v, dest);
      newArtwork[k as ArtworkKind] = dest;
    }
  }
  let newNfo = show.nfoPath;
  if (show.nfoPath && fs.existsSync(show.nfoPath) && path.dirname(show.nfoPath) === oldShowDir) {
    newNfo = path.join(newShowDir, path.basename(show.nfoPath));
    moveFileSafe(show.nfoPath, newNfo);
  }
  // Check if oldShowDir is now empty
  try {
    if (fs.readdirSync(oldShowDir).length === 0) fs.rmdirSync(oldShowDir);
  } catch {
    // ignore
  }
  db.updateTvShow(show.id, { folderPath: newShowDir, artwork: newArtwork, nfoPath: newNfo });
}

export function discoverSidecarSubtitles(videoPath: string): string[] {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => {
      const full = path.join(dir, name);
      return isSubtitleFile(full) && name.startsWith(base);
    })
    .map((name) => path.join(dir, name));
}
