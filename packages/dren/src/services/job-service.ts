import { ObjectId } from 'mongodb';
import type { DatabaseAdapter, JobDocument, JobInput, JobConfig } from '../types.js';

/**
 * Job Service - Handles all job-related operations
 * Decoupled from database implementation through DatabaseAdapter interface
 */
export class JobService {
  constructor(private adapter: DatabaseAdapter) {}

  /**
   * Enqueue a single job
   */
  async enqueue<T>(jobInput: JobInput<T>, jobConfig: JobConfig): Promise<string> {
    const maxRunningDurationMs = jobInput.maxRunningDurationMs ?? jobConfig.maxRunningDurationMs;
    const jobDoc: Omit<JobDocument<T>, '_id'> = {
      name: jobInput.name,
      payload: jobInput.payload,
      metadata: jobInput.metadata,
      status: 'pending',
      priority: jobInput.priority ?? jobConfig.priority,
      attempts: 0,
      maxRetries: jobInput.maxRetries ?? jobConfig.maxRetries,
      maxBackoffMs: jobInput.maxBackoffMs ?? jobConfig.maxBackoffMs,
      maxRunningDurationMs,
      errors: [],
      createdAt: new Date(),
      stuckAfter: maxRunningDurationMs ? new Date(Date.now() + maxRunningDurationMs) : undefined,
    };

    return await this.adapter.createJob(jobDoc);
  }

  /**
   * Enqueue multiple jobs
   */
  async enqueueBatch<T>(
    jobs: JobInput<T>[],
    jobRegistry: Map<string, JobConfig>
  ): Promise<string[]> {
    const jobDocs: Omit<JobDocument<T>, '_id'>[] = [];

    for (const jobInput of jobs) {
      const jobConfig = jobRegistry.get(jobInput.name);
      if (!jobConfig) {
        throw new Error(`Job type '${jobInput.name}' not registered`);
      }

      const maxRunningDurationMs = jobInput.maxRunningDurationMs ?? jobConfig.maxRunningDurationMs;
      const jobDoc: Omit<JobDocument<T>, '_id'> = {
        name: jobInput.name,
        payload: jobInput.payload,
        metadata: jobInput.metadata,
        status: 'pending',
        priority: jobInput.priority ?? jobConfig.priority,
        attempts: 0,
        maxRetries: jobInput.maxRetries ?? jobConfig.maxRetries,
        maxBackoffMs: jobInput.maxBackoffMs ?? jobConfig.maxBackoffMs,
        maxRunningDurationMs,
        errors: [],
        createdAt: new Date(),
        stuckAfter: maxRunningDurationMs ? new Date(Date.now() + maxRunningDurationMs) : undefined,
      };

      jobDocs.push(jobDoc);
    }

    return await this.adapter.createJobs(jobDocs);
  }

  /**
   * Find and lock a job for processing
   */
  async findAndLockJob(jobNames?: string[]): Promise<JobDocument | null> {
    return await this.adapter.findAndLockJob(jobNames);
  }

  /**
   * Mark job as succeeded
   */
  async markJobSucceeded(jobId: string, result?: { id: string; type: string }): Promise<void> {
    await this.adapter.updateJobStatus(jobId, 'succeeded', {
      processedAt: new Date(),
      result: result ? { id: new ObjectId(result.id), type: result.type } : undefined,
    });
  }

  /**
   * Handle job failure with retry logic
   */
  async handleJobFailure(
    jobId: string,
    error: Error,
    jobConfig: JobConfig,
    customErrorHandler?: (error: Error, job: JobDocument, adapter: DatabaseAdapter) => Promise<void>
  ): Promise<void> {
    const job = await this.adapter.findJobById(jobId);
    if (!job) return;

    // Check if custom error handler is provided
    if (customErrorHandler) {
      try {
        await customErrorHandler(error, job, this.adapter);
        return; // Custom handler took care of everything
      } catch (handlerError) {
        console.error('❌ Custom error handler failed:', handlerError);
        // Fall through to default error handling
      }
    }

    // Default error handling
    const errorEntry = {
      attempt: job.attempts,
      error: error.message,
      stackTrace: error.stack || '',
      timestamp: new Date(),
    };

    // Add error to job's error history
    await this.adapter.addJobError(jobId, errorEntry);

    // Check if we should retry
    if (job.attempts <= jobConfig.maxRetries) {
      // Calculate exponential backoff
      const backoffMs = Math.min(Math.pow(2, job.attempts) * 1000, jobConfig.maxBackoffMs);
      const nextRunAt = new Date(Date.now() + backoffMs);

      await this.adapter.updateJobStatus(jobId, 'pending', { nextRunAt });
      console.log(`🔄 Job ${jobId} scheduled for retry in ${backoffMs}ms`);
    } else {
      // Max retries exceeded, mark as failed
      await this.adapter.updateJobStatus(jobId, 'failed', { processedAt: new Date() });
      console.log(`💀 Job ${jobId} failed permanently after ${job.attempts} attempts`);
    }
  }

  /**
   * Reset stuck jobs
   */
  async resetStuckJobs(): Promise<number> {
    return await this.adapter.resetStuckJobs();
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<JobDocument | null> {
    return await this.adapter.findJobById(jobId);
  }

  /**
   * Get jobs by status
   */
  async getJobsByStatus(
    status: 'pending' | 'processing' | 'succeeded' | 'failed',
    limit?: number
  ): Promise<JobDocument[]> {
    return await this.adapter.findJobsByStatus(status, limit);
  }
}
