import type {
  DatabaseAdapter,
  JobDocument,
  JobConfig,
  JobProcessor,
  CustomErrorHandler,
  WorkerState,
} from '../types.js';

/**
 * Worker Service - Handles worker lifecycle and job processing
 * Decoupled from database implementation through DatabaseAdapter interface
 */
export class WorkerService {
  private workerState: WorkerState = {
    isRunning: false,
    isStopping: false,
    activeJobs: new Set(),
  };

  constructor(
    private adapter: DatabaseAdapter,
    private jobRegistry: Map<string, JobConfig>,
    private workerOptions: {
      pollIntervalMs?: number;
      concurrency?: number;
      jobNames?: string[];
      stuckJobTimeoutMs?: number;
      customErrorHandler?: CustomErrorHandler;
    } = {}
  ) {}

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (this.workerState.isRunning) {
      console.log('⚠️  Worker is already running');
      return;
    }

    console.log('🔄 Starting Dren worker...');
    this.workerState.isRunning = true;
    this.workerState.isStopping = false;

    // Start polling loop
    this.startPolling();
    // Start stuck job checker
    this.startStuckJobChecker();
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    if (!this.workerState.isRunning) {
      console.log('⚠️  Worker is not running');
      return;
    }

    console.log('🛑 Stopping Dren worker...');
    this.workerState.isStopping = true;

    // Clear polling timer
    if (this.workerState.pollTimer) {
      clearTimeout(this.workerState.pollTimer);
      this.workerState.pollTimer = undefined;
    }

    // Wait for active jobs to complete
    await this.waitForActiveJobs();

    this.workerState.isRunning = false;
    this.workerState.isStopping = false;
    console.log('✅ Dren worker stopped');
  }

  /**
   * Start the polling loop
   */
  private startPolling(): void {
    const pollIntervalMs = this.workerOptions.pollIntervalMs || 5000;

    const poll = async () => {
      if (!this.workerState.isRunning || this.workerState.isStopping) {
        return;
      }

      try {
        // Check if we have capacity for more jobs
        const concurrency = this.workerOptions.concurrency || 1;
        if (this.workerState.activeJobs.size >= concurrency) {
          // All workers are busy, poll again after interval
          this.workerState.pollTimer = setTimeout(poll, pollIntervalMs);
          return;
        }

        // Try to find and process a job
        const job = await this.adapter.findAndLockJob(this.workerOptions.jobNames);

        if (job) {
          // Found a job, process it immediately
          this.processJob(job);
          // Poll again quickly to get more jobs
          this.workerState.pollTimer = setTimeout(poll, 100);
        } else {
          // No jobs available, poll again after interval
          this.workerState.pollTimer = setTimeout(poll, pollIntervalMs);
        }
      } catch (error) {
        console.error('❌ Error in polling loop:', error);
        // Continue polling even if there's an error
        this.workerState.pollTimer = setTimeout(poll, pollIntervalMs);
      }
    };

    // Start polling
    poll();
  }

  /**
   * Process a single job
   */
  private async processJob(job: JobDocument): Promise<void> {
    const jobId = job._id.toString();
    this.workerState.activeJobs.add(jobId);

    try {
      const jobConfig = this.jobRegistry.get(job.name);
      if (!jobConfig) {
        throw new Error(`Job type '${job.name}' not registered`);
      }

      console.log(`🔄 Processing job ${jobId} (${job.name}) - attempt ${job.attempts}`);

      // Execute the job processor
      await (jobConfig.processor as JobProcessor)(job.payload, {
        jobId,
        attempt: job.attempts,
        jobType: job.name,
      });

      // Job succeeded
      await this.adapter.updateJobStatus(jobId, 'succeeded', {
        processedAt: new Date(),
      });

      console.log(`✅ Job ${jobId} completed successfully`);
    } catch (error) {
      console.error(`❌ Job ${jobId} failed:`, error);

      // Handle job failure
      const jobConfig = this.jobRegistry.get(job.name);
      if (jobConfig) {
        await this.handleJobFailure(jobId, error as Error, jobConfig);
      }
    } finally {
      this.workerState.activeJobs.delete(jobId);
    }
  }

  /**
   * Handle job failure with retry logic
   */
  private async handleJobFailure(jobId: string, error: Error, jobConfig: JobConfig): Promise<void> {
    const job = await this.adapter.findJobById(jobId);
    if (!job) return;

    // Check if custom error handler is provided
    const customErrorHandler = this.workerOptions.customErrorHandler;
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
   * Start the stuck job checker
   */
  private startStuckJobChecker(): void {
    const checkStuckJobs = async () => {
      if (!this.workerState.isRunning || this.workerState.isStopping) {
        return;
      }

      try {
        await this.adapter.resetStuckJobs();
      } catch (error) {
        console.error('❌ Error in stuck job checker:', error);
      }

      // Schedule next check in 30 seconds
      setTimeout(checkStuckJobs, 30000);
    };

    // Start the stuck job checker immediately, then every 30 seconds
    setTimeout(checkStuckJobs, 1000); // Start after 1 second
  }

  /**
   * Wait for all active jobs to complete
   */
  private async waitForActiveJobs(): Promise<void> {
    const maxWaitTime = 30000; // 30 seconds
    const checkInterval = 100; // 100ms
    let waitTime = 0;

    while (this.workerState.activeJobs.size > 0 && waitTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      waitTime += checkInterval;
    }

    if (this.workerState.activeJobs.size > 0) {
      console.warn(
        `⚠️  ${this.workerState.activeJobs.size} jobs still running after ${maxWaitTime}ms`
      );
    }
  }

  /**
   * Get worker state
   */
  getState(): WorkerState {
    return { ...this.workerState };
  }
}
