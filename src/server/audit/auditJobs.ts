/**
 * Runs the library audit as a pollable job instead of a blocking request.
 *
 * The audit walks every movie, show, episode and subtitle row, and its most expensive
 * pass is a per-show query. On a large library that took long enough that the request
 * sat open with no feedback, and the page looked hung. A single long request cannot say
 * how far along it is, so the work moved behind a job id:
 *
 *   POST /api/audit/run   → { jobId }
 *   GET  /api/audit/job/:id → { status, progress, report? }
 *
 * Storing a job costs one closure per run, so only a handful are kept — this is a
 * progress channel, not a history.
 */

import crypto from 'node:crypto';
import type { LibraryAuditReport } from '../../shared/types.js';
import { MediaDatabase } from '../db/database.js';
import { buildAuditReport, type AuditProgress } from './auditEngine.js';

export type AuditJobStatus = 'running' | 'completed' | 'failed';

export interface AuditJob {
  jobId: string;
  status: AuditJobStatus;
  progress: AuditProgress;
  report: LibraryAuditReport | null;
  error: string | null;
  startedAt: number;
  finishedAt: number | null;
}

/** Enough to serve a UI that polls one job, without retaining old reports forever. */
const MAX_JOBS = 5;

export class AuditJobManager {
  private jobs = new Map<string, AuditJob>();
  private order: string[] = [];

  constructor(private db: MediaDatabase) {}

  getJob(jobId: string): AuditJob | null {
    const job = this.jobs.get(jobId);
    return job ? { ...job } : null;
  }

  /** Most recent job, so a reloaded page can reattach to work already in flight. */
  latest(): AuditJob | null {
    const id = this.order[0];
    return id ? this.getJob(id) : null;
  }

  start(): AuditJob {
    const jobId = crypto.randomUUID();
    const job: AuditJob = {
      jobId,
      status: 'running',
      progress: { phase: 'Starting', completed: 0, total: 6, percent: 0 },
      report: null,
      error: null,
      startedAt: Date.now(),
      finishedAt: null,
    };
    this.jobs.set(jobId, job);
    this.order.unshift(jobId);
    while (this.order.length > MAX_JOBS) {
      const dropped = this.order.pop();
      if (dropped) this.jobs.delete(dropped);
    }

    // `setImmediate` so the HTTP response returns with the job id before the work
    // starts; otherwise the caller would still wait for the whole audit.
    setImmediate(() => {
      const stored = this.jobs.get(jobId);
      if (!stored) return;
      try {
        stored.report = buildAuditReport(this.db, (update) => {
          // Mutate in place: the getter returns copies, so this is the live object.
          stored.progress = update;
        });
        stored.status = 'completed';
        stored.progress = { ...stored.progress, phase: 'Done', percent: 100 };
      } catch (err) {
        stored.status = 'failed';
        stored.error = err instanceof Error ? err.message : String(err);
      } finally {
        stored.finishedAt = Date.now();
      }
    });

    return { ...job };
  }
}
