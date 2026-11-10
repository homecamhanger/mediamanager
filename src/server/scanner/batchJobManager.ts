import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { BatchJob, BatchJobKind } from '../../shared/types.js';
import { DEFAULT_PREFERENCES, MediaDatabase } from '../db/database.js';
import {
  serializeEpisodeNfo,
  serializeSeasonNfo,
  serializeTvShowNfo,
  validateKodiNfoXml,
} from '../nfo/kodiNfo.js';
import { ScraperEngine } from '../scrapers/scraperEngine.js';
import { SubtitleEngine } from '../subtitles/subtitleEngine.js';

const yieldTurn = () => new Promise<void>((resolve) => setImmediate(resolve));

export class BatchJobManager {
  private jobs = new Map<string, BatchJob>();
  private order: string[] = [];

  constructor(private db: MediaDatabase) {}

  private registerJob(kind: BatchJobKind, label: string, totalCount: number): BatchJob {
    const jobId = crypto.randomUUID();
    const job: BatchJob = {
      jobId,
      kind,
      label,
      status: 'running',
      overallPercent: totalCount === 0 ? 100 : 0,
      processedCount: 0,
      totalCount,
      succeededCount: 0,
      skippedCount: 0,
      failedCount: 0,
      currentItem: totalCount === 0 ? 'Nothing to process' : 'Starting...',
      cancelRequested: false,
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.jobs.set(jobId, job);
    this.order.unshift(jobId);
    if (this.order.length > 30) {
      const removed = this.order.pop();
      if (removed) this.jobs.delete(removed);
    }
    return { ...job };
  }

  getJob(jobId: string): BatchJob | null {
    const j = this.jobs.get(jobId);
    return j ? { ...j } : null;
  }

  listJobs(): BatchJob[] {
    return this.order
      .map((id) => this.jobs.get(id))
      .filter((j): j is BatchJob => Boolean(j))
      .map((j) => ({ ...j }));
  }

  cancelJob(jobId: string): BatchJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    if (job.status === 'running') {
      job.cancelRequested = true;
      job.detail = 'Cancelling after current item...';
    }
    return { ...job };
  }

  private finalizeCancelled(job: BatchJob) {
    job.status = 'cancelled';
    job.finishedAt = new Date().toISOString();
    job.currentItem = 'Cancelled';
    this.db.logActivity(
      job.kind === 'subtitles' ? 'subtitle' : job.kind === 'nfo' ? 'nfo' : 'scrape',
      `${job.label} Cancelled`,
      `Cancelled after ${job.processedCount}/${job.totalCount} items (${job.succeededCount} succeeded)`,
      'warning'
    );
  }

  private finalizeCompleted(job: BatchJob, summaryDetail: string) {
    job.status = 'completed';
    job.overallPercent = 100;
    job.currentItem = undefined;
    job.detail = summaryDetail;
    job.finishedAt = new Date().toISOString();
  }

  startBatchScrape(opts: { scope?: 'unscraped' | 'all' } = {}): BatchJob {
    const scope = opts.scope ?? 'unscraped';
    const movies = this.db.listMovies().filter((m) => (scope === 'all' ? true : !m.scraped));
    const shows = this.db.listTvShows().filter((s) => (scope === 'all' ? true : !s.scraped));
    const total = movies.length + shows.length;

    const job = this.registerJob(
      'scrape',
      scope === 'all' ? 'Re-scrape Full Library' : 'Batch Scrape Unscraped',
      total
    );

    if (total === 0) {
      const stored = this.jobs.get(job.jobId)!;
      this.finalizeCompleted(stored, 'All items are already scraped');
      return { ...stored };
    }

    setImmediate(() => {
      void (async () => {
        const stored = this.jobs.get(job.jobId)!;
        const scraper = new ScraperEngine(this.db);
        try {
          for (const m of movies) {
            if (stored.cancelRequested) {
              this.finalizeCancelled(stored);
              return;
            }
            stored.currentItem = `Movie: ${m.title}`;
            try {
              const res = await scraper.autoScrapeMovie(m.id);
              if (res.matched) stored.succeededCount++;
              else stored.skippedCount++;
            } catch {
              stored.failedCount++;
            }
            stored.processedCount++;
            stored.overallPercent = Math.round((stored.processedCount / Math.max(1, stored.totalCount)) * 100);
            await yieldTurn();
          }

          for (const s of shows) {
            if (stored.cancelRequested) {
              this.finalizeCancelled(stored);
              return;
            }
            stored.currentItem = `Series: ${s.title}`;
            try {
              const res = await scraper.autoScrapeShow(s.id);
              if (res.matched) stored.succeededCount++;
              else stored.skippedCount++;
            } catch {
              stored.failedCount++;
            }
            stored.processedCount++;
            stored.overallPercent = Math.round((stored.processedCount / Math.max(1, stored.totalCount)) * 100);
            await yieldTurn();
          }

          this.finalizeCompleted(
            stored,
            `Scraped ${stored.succeededCount} items (${stored.skippedCount} unmatched, ${stored.failedCount} failed)`
          );
          this.db.logActivity('scrape', stored.label, stored.detail!, 'success');
        } catch (err) {
          stored.status = 'failed';
          stored.error = (err as Error).message;
          stored.finishedAt = new Date().toISOString();
        }
      })();
    });

    return job;
  }

  startBatchSubtitles(opts: { languages?: string[] } = {}): BatchJob {
    const prefs = this.db.getSetting('preferences', DEFAULT_PREFERENCES);
    const languages = opts.languages?.length ? opts.languages : prefs.preferredSubtitleLanguages;

    const tasks: Array<{ mediaType: 'movie' | 'episode'; mediaId: number; label: string; lang: string }> = [];
    for (const m of this.db.listMovies()) {
      for (const lang of languages) {
        if (!m.subtitles.some((s) => s.language === lang && !s.forced)) {
          tasks.push({ mediaType: 'movie', mediaId: m.id, label: `${m.title} (${lang})`, lang });
        }
      }
    }
    for (const ep of this.db.listAllEpisodes()) {
      for (const lang of languages) {
        if (!ep.subtitles.some((s) => s.language === lang && !s.forced)) {
          const code = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
          tasks.push({
            mediaType: 'episode',
            mediaId: ep.id,
            label: `${ep.showTitle || 'Series'} ${code} (${lang})`,
            lang,
          });
        }
      }
    }

    const job = this.registerJob('subtitles', 'Download Missing Subtitles', tasks.length);
    if (tasks.length === 0) {
      const stored = this.jobs.get(job.jobId)!;
      this.finalizeCompleted(stored, 'No missing subtitles for preferred languages');
      return { ...stored };
    }

    setImmediate(() => {
      void (async () => {
        const stored = this.jobs.get(job.jobId)!;
        const subEngine = new SubtitleEngine(this.db);
        try {
          for (const task of tasks) {
            if (stored.cancelRequested) {
              this.finalizeCancelled(stored);
              return;
            }
            stored.currentItem = task.label;
            try {
              const found = await subEngine.searchSubtitles({
                mediaType: task.mediaType,
                mediaId: task.mediaId,
                languages: [task.lang],
              });
              const best = found.find((f) => !f.forced) ?? found[0];
              if (best) {
                await subEngine.downloadSubtitle({
                  mediaType: task.mediaType,
                  mediaId: task.mediaId,
                  candidate: best,
                });
                stored.succeededCount++;
              } else {
                stored.skippedCount++;
              }
            } catch {
              stored.failedCount++;
            }
            stored.processedCount++;
            stored.overallPercent = Math.round((stored.processedCount / Math.max(1, stored.totalCount)) * 100);
            await yieldTurn();
          }

          this.finalizeCompleted(
            stored,
            `Downloaded ${stored.succeededCount} subtitles (${stored.skippedCount} unavailable)`
          );
          this.db.logActivity('subtitle', stored.label, stored.detail!, 'success');
        } catch (err) {
          stored.status = 'failed';
          stored.error = (err as Error).message;
          stored.finishedAt = new Date().toISOString();
        }
      })();
    });

    return job;
  }

  startBatchNfoSync(opts: { scope?: 'all' | 'missing' } = {}): BatchJob {
    const scope = opts.scope ?? 'all';
    const movies = this.db.listMovies().filter((m) => (scope === 'missing' ? !m.hasNfo || !m.nfoValid : true));
    const shows = this.db.listTvShows();
    const seasons = shows.flatMap((s) => this.db.listSeasonsForShow(s.id).filter((sn) => Boolean(sn.folderPath)));
    const episodes = this.db
      .listAllEpisodes()
      .filter((ep) => (scope === 'missing' ? !ep.hasNfo || !ep.nfoValid : true));
    const filteredShows = shows.filter((s) => (scope === 'missing' ? !s.hasNfo || !s.nfoValid : true));
    const total = movies.length + filteredShows.length + seasons.length + episodes.length;

    const job = this.registerJob('nfo', scope === 'missing' ? 'Write Missing NFO Files' : 'Sync All Kodi NFOs', total);
    if (total === 0) {
      const stored = this.jobs.get(job.jobId)!;
      this.finalizeCompleted(stored, 'All NFO files are already present and valid');
      return { ...stored };
    }

    setImmediate(() => {
      void (async () => {
        const stored = this.jobs.get(job.jobId)!;
        const scraper = new ScraperEngine(this.db);
        try {
          for (const m of movies) {
            if (stored.cancelRequested) {
              this.finalizeCancelled(stored);
              return;
            }
            stored.currentItem = `movie.nfo: ${m.title}`;
            try {
              const u = await scraper.writeMovieNfo(m.id);
              if (u) stored.succeededCount++;
              else stored.skippedCount++;
            } catch {
              stored.failedCount++;
            }
            stored.processedCount++;
            stored.overallPercent = Math.round((stored.processedCount / Math.max(1, stored.totalCount)) * 100);
            await yieldTurn();
          }

          for (const show of filteredShows) {
            if (stored.cancelRequested) {
              this.finalizeCancelled(stored);
              return;
            }
            stored.currentItem = `tvshow.nfo: ${show.title}`;
            try {
              const showSeasons = this.db.listSeasonsForShow(show.id);
              const xml = serializeTvShowNfo(show, showSeasons);
              const showNfoPath = path.join(show.folderPath, 'tvshow.nfo');
              fs.mkdirSync(path.dirname(showNfoPath), { recursive: true });
              fs.writeFileSync(showNfoPath, xml, 'utf-8');
              const rep = validateKodiNfoXml(xml);
              this.db.updateTvShow(show.id, {
                nfoPath: showNfoPath,
                hasNfo: true,
                nfoValid: rep.valid,
                nfoWarnings: rep.warnings,
              });
              stored.succeededCount++;
            } catch {
              stored.failedCount++;
            }
            stored.processedCount++;
            stored.overallPercent = Math.round((stored.processedCount / Math.max(1, stored.totalCount)) * 100);
            await yieldTurn();
          }

          for (const s of seasons) {
            if (stored.cancelRequested) {
              this.finalizeCancelled(stored);
              return;
            }
            stored.currentItem = `season.nfo: ${s.name}`;
            try {
              if (s.folderPath) {
                const snPath = path.join(s.folderPath, 'season.nfo');
                fs.mkdirSync(path.dirname(snPath), { recursive: true });
                fs.writeFileSync(snPath, serializeSeasonNfo(s), 'utf-8');
                this.db.upsertTvSeason({ ...s, nfoPath: snPath, hasNfo: true });
                stored.succeededCount++;
              } else {
                stored.skippedCount++;
              }
            } catch {
              stored.failedCount++;
            }
            stored.processedCount++;
            stored.overallPercent = Math.round((stored.processedCount / Math.max(1, stored.totalCount)) * 100);
            await yieldTurn();
          }

          for (const ep of episodes) {
            if (stored.cancelRequested) {
              this.finalizeCancelled(stored);
              return;
            }
            const code = `S${String(ep.seasonNumber).padStart(2, '0')}E${String(ep.episodeNumber).padStart(2, '0')}`;
            stored.currentItem = `${code}.nfo: ${ep.title}`;
            try {
              const base = path.basename(ep.filePath, path.extname(ep.filePath));
              const epNfo = path.join(ep.folderPath, `${base}.nfo`);
              const epXml = serializeEpisodeNfo(ep);
              fs.mkdirSync(path.dirname(epNfo), { recursive: true });
              fs.writeFileSync(epNfo, epXml, 'utf-8');
              const epRep = validateKodiNfoXml(epXml);
              this.db.updateTvEpisode(ep.id, {
                nfoPath: epNfo,
                hasNfo: true,
                nfoValid: epRep.valid,
                nfoWarnings: epRep.warnings,
              });
              stored.succeededCount++;
            } catch {
              stored.failedCount++;
            }
            stored.processedCount++;
            stored.overallPercent = Math.round((stored.processedCount / Math.max(1, stored.totalCount)) * 100);
            await yieldTurn();
          }

          this.finalizeCompleted(stored, `Synchronized ${stored.succeededCount} NFO files`);
          this.db.logActivity('nfo', stored.label, stored.detail!, 'success');
        } catch (err) {
          stored.status = 'failed';
          stored.error = (err as Error).message;
          stored.finishedAt = new Date().toISOString();
        }
      })();
    });

    return job;
  }
}
