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

export class ScanJobManager {
  private jobs = new Map<string, SourceScanJob>();

  createJob(source: MediaSource, registerDone = true): SourceScanJob {
    const job: SourceScanJob = {
      jobId: crypto.randomUUID(),
      sourceId: source.id,
      sourceName: source.name,
      sourcePath: source.path,
      mediaKind: source.mediaKind,
      status: 'running',
      overallPercent: registerDone ? 8 : 2,
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

  getJob(jobId: string): SourceScanJob | null {
    const j = this.jobs.get(jobId);
    return j ? this.clone(j) : null;
  }

  listJobs(): SourceScanJob[] {
    return [...this.jobs.values()]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
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

  private pruneOldJobs() {
    if (this.jobs.size <= 30) return;
    const sorted = [...this.jobs.values()].sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    for (const j of sorted.slice(0, this.jobs.size - 30)) {
      if (j.status !== 'running') this.jobs.delete(j.jobId);
    }
  }

  private clone(job: SourceScanJob): SourceScanJob {
    return {
      ...job,
      steps: job.steps.map((s) => ({ ...s })),
    };
  }
}
