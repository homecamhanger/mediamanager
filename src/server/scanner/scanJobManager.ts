import crypto from 'node:crypto';
import type { MediaSource, ScanStepId, ScanStepProgress, SourceScanJob } from '../../shared/types.js';

export function createInitialScanSteps(source: MediaSource, registerDone = true): ScanStepProgress[] {
  return [
    {
      id: 'register_source',
      label: 'Register & validate media source',
      description: 'Save folder configuration and verify directory access',
      status: registerDone ? 'completed' : 'in_progress',
      detail: registerDone ? `Added "${source.name}"` : undefined,
    },
    {
      id: 'discover_files',
      label: 'Discover folders & video files',
      description:
        source.mediaKind === 'movie'
          ? 'Walk movie folders and locate supported video files'
          : 'Locate TV series folders, seasons, and episode files',
      status: 'pending',
    },
    {
      id: 'probe_and_hash',
      label: 'Analyze streams & compute hashes',
      description: 'Probe video/audio codecs, duration, and 64-bit OpenSubtitles hashes',
      status: 'pending',
    },
    {
      id: 'parse_sidecars',
      label: 'Index NFOs, artwork & subtitles',
      description: 'Parse Kodi XML NFOs, discover artwork slots, and index subtitle files',
      status: 'pending',
    },
    {
      id: 'finalize',
      label: 'Finalize library index',
      description: 'Clean up stale records and update library telemetry',
      status: 'pending',
    },
  ];
}

interface QueuedScanTask {
  jobId: string;
  run: () => Promise<void>;
}

export class ScanJobManager {
  private jobs = new Map<string, SourceScanJob>();
  private queue: QueuedScanTask[] = [];
  private activeJobId: string | null = null;

  createJob(
    source: MediaSource,
    registerDone = true,
    initialStatus: 'queued' | 'running' = 'running'
  ): SourceScanJob {
    const job: SourceScanJob = {
      jobId: crypto.randomUUID(),
      sourceId: source.id,
      sourceName: source.name,
      sourcePath: source.path,
      mediaKind: source.mediaKind,
      status: initialStatus,
      overallPercent: initialStatus === 'queued' ? 5 : registerDone ? 8 : 2,
      currentItem: initialStatus === 'queued' ? 'Queued behind active scan...' : undefined,
      itemsProcessed: 0,
      itemsTotal: 0,
      moviesScanned: 0,
      showsScanned: 0,
      episodesScanned: 0,
      steps: createInitialScanSteps(source, registerDone),
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    this.jobs.set(job.jobId, job);
    this.pruneOldJobs();
    return this.clone(job);
  }

  enqueueScan(source: MediaSource, runner: (jobId: string) => Promise<void>): SourceScanJob {
    // Avoid creating duplicate queued/running jobs for the same source
    const existing = [...this.jobs.values()].find(
      (j) => j.sourceId === source.id && (j.status === 'running' || j.status === 'queued')
    );
    if (existing) {
      return this.clone(existing);
    }

    const shouldStartImmediately = !this.activeJobId && this.queue.length === 0;
    const job = this.createJob(source, true, shouldStartImmediately ? 'running' : 'queued');

    if (shouldStartImmediately) {
      this.activeJobId = job.jobId;
      setImmediate(() => {
        void this.runTask(job.jobId, () => runner(job.jobId));
      });
    } else {
      this.queue.push({ jobId: job.jobId, run: () => runner(job.jobId) });
    }

    return job;
  }

  private async runTask(jobId: string, run: () => Promise<void>): Promise<void> {
    this.activeJobId = jobId;
    const job = this.jobs.get(jobId);
    if (job && job.status === 'queued') {
      job.status = 'running';
      job.overallPercent = 8;
      job.currentItem = undefined;
    }

    try {
      await run();
    } catch (err) {
      this.failJob(jobId, (err as Error).message);
    } finally {
      this.activeJobId = null;
      const next = this.queue.shift();
      if (next) {
        setImmediate(() => {
          void this.runTask(next.jobId, next.run);
        });
      }
    }
  }

  getJob(jobId: string): SourceScanJob | null {
    const j = this.jobs.get(jobId);
    return j ? this.clone(j) : null;
  }

  listJobs(): SourceScanJob[] {
    return [...this.jobs.values()]
      .reverse()
      .slice(0, 12)
      .map((j) => this.clone(j));
  }

  updateJob(
    jobId: string,
    patch: Partial<Omit<SourceScanJob, 'jobId' | 'steps'>> & {
      stepUpdate?: {
        id: ScanStepId;
        status?: ScanStepProgress['status'];
        completedCount?: number;
        totalCount?: number;
        detail?: string;
      };
    }
  ): SourceScanJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    const { stepUpdate, ...rest } = patch;
    Object.assign(job, rest);
    if (stepUpdate) {
      const target = job.steps.find((s) => s.id === stepUpdate.id);
      if (target) {
        if (stepUpdate.status !== undefined) target.status = stepUpdate.status;
        if (stepUpdate.completedCount !== undefined) target.completedCount = stepUpdate.completedCount;
        if (stepUpdate.totalCount !== undefined) target.totalCount = stepUpdate.totalCount;
        if (stepUpdate.detail !== undefined) target.detail = stepUpdate.detail;
      }
    }
    return this.clone(job);
  }

  failJob(jobId: string, message: string): SourceScanJob | null {
    const job = this.jobs.get(jobId);
    if (!job) return null;
    job.status = 'failed';
    job.error = message;
    job.finishedAt = new Date().toISOString();
    const active = job.steps.find((s) => s.status === 'in_progress') ?? job.steps.find((s) => s.status === 'pending');
    if (active) {
      active.status = 'error';
      active.detail = message;
    }
    return this.clone(job);
  }

  private clone(job: SourceScanJob): SourceScanJob {
    return {
      ...job,
      steps: job.steps.map((s) => ({ ...s })),
    };
  }

  private pruneOldJobs() {
    if (this.jobs.size <= 30) return;
    const sorted = [...this.jobs.values()]
      .filter((j) => j.status === 'completed' || j.status === 'failed')
      .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    while (this.jobs.size > 30 && sorted.length > 0) {
      const old = sorted.shift();
      if (old) this.jobs.delete(old.jobId);
    }
  }
}
