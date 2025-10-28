import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import type {
  DrenConfig,
  DatabaseConnection,
  JobDocument,
  JobInput,
  JobRegistry,
  WorkerState,
  DatabaseAdapter,
} from './types.js';

/**
 * MongoDB adapter implementation
 */
class MongoAdapter implements DatabaseAdapter {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<JobDocument> | null = null;

  constructor(private config: DrenConfig['database']) {}

  async connect(): Promise<DatabaseConnection> {
    this.client = new MongoClient(this.config.url);
    await this.client.connect();

    this.db = this.client.db(this.config.dbName);
    this.collection = this.db.collection<JobDocument>(this.config.collectionName || 'job-queue');

    return {
      type: 'mongodb',
      client: this.client,
      db: this.db,
      collection: this.collection,
    };
  }

  async createIndexes(): Promise<void> {
    if (!this.collection) throw new Error('Not connected to database');

    // Primary polling index - optimized for job fetching with priority ordering
    await this.collection.createIndex(
      {
        status: 1, // Filter by status first (most selective)
        priority: 1, // Then by priority (lower number = higher priority)
        createdAt: 1, // Finally by creation time (FIFO within same priority)
      },
      {
        name: 'polling_index',
        background: true,
      }
    );

    // Scheduled jobs index - for jobs with nextRunAt
    await this.collection.createIndex(
      {
        status: 1, // Filter by status
        nextRunAt: 1, // Then by scheduled time
      },
      {
        name: 'scheduled_jobs_index',
        background: true,
      }
    );

    // Job type filtering index - for worker job type filtering
    await this.collection.createIndex(
      {
        name: 1, // Job type name
        status: 1, // Then by status
        priority: 1, // Then by priority
        createdAt: 1, // Finally by creation time
      },
      {
        name: 'job_type_index',
        background: true,
      }
    );

    // Stuck job detection index - for cleanup of stuck jobs
    await this.collection.createIndex(
      {
        status: 1, // Filter by processing status
        processedAt: 1, // Then by when it was last processed
      },
      {
        name: 'stuck_jobs_index',
        background: true,
      }
    );

    // Retry scheduling index - for jobs waiting to retry
    await this.collection.createIndex(
      {
        status: 1, // Filter by pending status
        nextRunAt: 1, // Then by retry time
        priority: 1, // Then by priority
        createdAt: 1, // Finally by creation time
      },
      {
        name: 'retry_index',
        background: true,
      }
    );

    // Job lookup by ID index - for quick job updates (MongoDB creates this automatically)
    // No need to create _id index as it's created automatically by MongoDB
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
    }
  }
}

/**
 * Main Dren job queue class
 */
export class Dren {
  private adapter: DatabaseAdapter;
  public connection: DatabaseConnection | null = null;
  private jobRegistry: JobRegistry = new Map();
  private workerState: WorkerState = {
    isRunning: false,
    isStopping: false,
    activeJobs: new Set(),
  };

  constructor(private config: DrenConfig) {
    this.adapter = new MongoAdapter(config.database);
  }

  /**
   * Initialize the job queue - connect to database and create indexes
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Dren job queue...');

    // Connect to database
    this.connection = await this.adapter.connect();
    console.log('✅ Connected to database');

    // Create indexes
    await this.adapter.createIndexes();
    console.log('✅ Created database indexes');

    // Register job configurations
    for (const [name, jobConfig] of this.config.jobConfigs) {
      this.jobRegistry.set(name, jobConfig);
    }
    console.log(`✅ Registered ${this.jobRegistry.size} job types`);
  }

  /**
   * Enqueue a single job
   */
  async enqueue<T>(jobInput: JobInput<T>): Promise<string> {
    if (!this.connection) throw new Error('Dren not initialized. Call initialize() first.');

    const jobConfig = this.jobRegistry.get(jobInput.name);
    if (!jobConfig) {
      throw new Error(`Job type '${jobInput.name}' not registered`);
    }

    const maxRunningDurationMs = jobInput.maxRunningDurationMs ?? jobConfig.maxRunningDurationMs;
    const jobDoc: Omit<JobDocument<T>, '_id'> = {
      name: jobInput.name,
      payload: jobInput.payload,
      metadata: jobInput.metadata, // Include metadata if provided
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

    const result = await this.connection.collection.insertOne(jobDoc as JobDocument<T>);
    return result.insertedId.toString();
  }

  /**
   * Enqueue multiple jobs
   */
  async enqueueBatch<T>(jobs: JobInput<T>[]): Promise<string[]> {
    if (!this.connection) throw new Error('Dren not initialized. Call initialize() first.');

    const jobDocs: JobDocument<T>[] = [];

    for (const jobInput of jobs) {
      const jobConfig = this.jobRegistry.get(jobInput.name);
      if (!jobConfig) {
        throw new Error(`Job type '${jobInput.name}' not registered`);
      }

      const maxRunningDurationMs = jobInput.maxRunningDurationMs ?? jobConfig.maxRunningDurationMs;
      const jobDoc: Omit<JobDocument<T>, '_id'> = {
        name: jobInput.name,
        payload: jobInput.payload,
        metadata: jobInput.metadata, // Include metadata if provided
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

      jobDocs.push(jobDoc as JobDocument<T>);
    }

    const result = await this.connection.collection.insertMany(jobDocs);
    return Object.values(result.insertedIds).map(id => id.toString());
  }

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

    // Clear the polling timer
    if (this.workerState.pollTimer) {
      clearTimeout(this.workerState.pollTimer);
      this.workerState.pollTimer = undefined;
    }

    // Wait for active jobs to complete
    while (this.workerState.activeJobs.size > 0) {
      console.log(`⏳ Waiting for ${this.workerState.activeJobs.size} active jobs to complete...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    this.workerState.isRunning = false;
    console.log('✅ Worker stopped gracefully');
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    await this.adapter.disconnect();
    this.connection = null;
    console.log('🔌 Disconnected from database');
  }

  /**
   * Start the stuck job checker (runs every 30 seconds)
   */
  private startStuckJobChecker(): void {
    const checkStuckJobs = async () => {
      if (!this.workerState.isRunning || this.workerState.isStopping) {
        return;
      }

      try {
        await this.resetStuckJobs();
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
   * Start the job polling loop
   */
  private startPolling(): void {
    const pollInterval = this.config.workerOptions?.pollIntervalMs || 5000;
    const concurrency = this.config.workerOptions?.concurrency || 1;
    const jobNames = this.config.workerOptions?.jobNames;

    const poll = async () => {
      if (!this.workerState.isRunning || this.workerState.isStopping) {
        return;
      }

      try {
        // Check if we can process more jobs
        if (this.workerState.activeJobs.size >= concurrency) {
          // Still processing jobs, check again later
          this.workerState.pollTimer = setTimeout(poll, 1000);
          return;
        }

        // Find and lock a job
        const job = await this.findAndLockJob(jobNames);

        if (job) {
          // Job found! Process it and stop polling until completion
          this.processJob(job).finally(() => {
            // Job completed, resume polling
            if (this.workerState.isRunning && !this.workerState.isStopping) {
              this.workerState.pollTimer = setTimeout(poll, 100); // Quick check for more jobs
            }
          });
        } else {
          // No job found, continue polling at normal interval
          this.workerState.pollTimer = setTimeout(poll, pollInterval);
        }
      } catch (error) {
        console.error('❌ Error in polling loop:', error);
        // On error, wait a bit before retrying
        this.workerState.pollTimer = setTimeout(poll, 5000);
      }
    };

    // Start the polling loop
    this.workerState.pollTimer = setTimeout(poll, 100); // Start immediately
  }

  /**
   * Find and atomically lock a job for processing
   * CONCURRENT PROCESSING WITHIN SAME PRIORITY: Allow concurrent processing of jobs with same priority
   * STRICT PRIORITY ENFORCEMENT: No lower priority jobs can run before higher priority jobs
   */
  private async findAndLockJob(jobNames?: string[]): Promise<JobDocument | null> {
    if (!this.connection) return null;

    const now = new Date();

    // Build base query for available jobs
    const baseQuery: Record<string, unknown> = {
      status: 'pending',
      $or: [{ nextRunAt: { $exists: false } }, { nextRunAt: { $lte: now } }],
    };

    // Filter by job names if specified
    if (jobNames && jobNames.length > 0) {
      baseQuery.name = { $in: jobNames };
    }

    // CRITICAL: Find the HIGHEST priority (lowest number) available job
    const highestPriorityJob = await this.connection.collection.findOne(baseQuery, {
      sort: {
        priority: 1, // Lower number = higher priority (1 before 2)
        createdAt: 1, // FIFO within same priority
      },
    });

    if (!highestPriorityJob) {
      return null; // No jobs available
    }

    // Check if there are ANY higher priority jobs still pending or processing
    // This prevents lower priority jobs from running
    const higherPriorityQuery: Record<string, unknown> = {
      $or: [
        {
          ...baseQuery,
          priority: { $lt: highestPriorityJob.priority || 999 }, // Higher priority pending jobs
        },
        {
          status: 'processing',
          priority: { $lt: highestPriorityJob.priority || 999 }, // Higher priority processing jobs
        },
      ],
    };

    const higherPriorityExists = await this.connection.collection.findOne(higherPriorityQuery);

    if (higherPriorityExists) {
      // There are higher priority jobs still pending or processing, don't process this job yet
      console.log(
        `⏳ Skipping priority ${highestPriorityJob.priority || 999} job - higher priority jobs still active`
      );
      return null;
    }

    // Safe to process this job - it's the highest priority available
    // Multiple workers can process jobs with the same priority concurrently
    const stuckAfter = highestPriorityJob.maxRunningDurationMs
      ? new Date(now.getTime() + highestPriorityJob.maxRunningDurationMs)
      : undefined;

    const result = await this.connection.collection.findOneAndUpdate(
      {
        _id: highestPriorityJob._id,
        status: 'pending', // Double-check it's still pending
      },
      {
        $set: {
          status: 'processing',
          processedAt: now,
          stuckAfter,
        },
        $inc: { attempts: 1 },
      },
      {
        returnDocument: 'after',
      }
    );

    return result || null;
  }

  /**
   * Reset stuck jobs using the efficient stuckAfter field
   */
  private async resetStuckJobs(): Promise<void> {
    if (!this.connection) return;

    const now = new Date();

    // Use the stuckAfter field for efficient querying - no need to calculate durations
    const stuckJobs = await this.connection.collection
      .find({
        status: 'processing',
        stuckAfter: { $lte: now }, // Jobs that should be considered stuck now
      })
      .toArray();

    let resetCount = 0;

    for (const job of stuckJobs) {
      const maxRunningDurationMs = job.maxRunningDurationMs || 300000; // Default 5 minutes
      if (!job.processedAt) continue; // Skip jobs without processedAt
      const runningDuration = now.getTime() - job.processedAt.getTime();

      console.warn(
        `⚠️  Job ${job._id} (${job.name}) has been running for ${Math.round(runningDuration / 1000)}s (max: ${Math.round(maxRunningDurationMs / 1000)}s), resetting to pending`
      );

      await this.connection.collection.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'pending',
            processedAt: undefined,
            stuckAfter: undefined,
            nextRunAt: new Date(), // Make it available for immediate reprocessing
          },
          $push: {
            errors: {
              attempt: -1, // Special attempt for stuck job reset
              error: `Job exceeded max running duration (${maxRunningDurationMs}ms) and was reset to pending`,
              timestamp: new Date(),
              stackTrace: 'Stuck job recovery',
            },
          },
        }
      );
      resetCount++;
    }

    if (resetCount > 0) {
      console.warn(`⚠️  Reset ${resetCount} stuck jobs to pending`);
    }
  }

  /**
   * Process a single job
   */
  private async processJob(job: JobDocument): Promise<void> {
    const jobId = job._id.toString();
    this.workerState.activeJobs.add(jobId);

    try {
      console.log(`🔄 Processing job ${jobId} (${job.name})`);

      const jobConfig = this.jobRegistry.get(job.name);
      if (!jobConfig) {
        throw new Error(`Job type '${job.name}' not registered`);
      }

      // Create job context
      const context = {
        jobId,
        attempt: job.attempts,
        jobType: job.name,
      };

      // Execute the job processor
      await jobConfig.processor(job.payload, context);

      // Mark job as succeeded
      await this.markJobSucceeded(jobId);
      console.log(`✅ Job ${jobId} completed successfully`);
    } catch (error) {
      console.error(`❌ Job ${jobId} failed:`, error);
      await this.handleJobFailure(jobId, error as Error);
    } finally {
      this.workerState.activeJobs.delete(jobId);
    }
  }

  /**
   * Mark a job as succeeded
   */
  private async markJobSucceeded(jobId: string): Promise<void> {
    if (!this.connection) return;

    await this.connection.collection.updateOne(
      { _id: new ObjectId(jobId) },
      {
        $set: {
          status: 'succeeded',
          completedAt: new Date(),
        },
      }
    );
  }

  /**
   * Handle job failure and retry logic
   */
  private async handleJobFailure(jobId: string, error: Error): Promise<void> {
    if (!this.connection) return;

    const job = await this.connection.collection.findOne({ _id: new ObjectId(jobId) });
    if (!job) return;

    const jobConfig = this.jobRegistry.get(job.name);
    if (!jobConfig) return;

    // Check if custom error handler is provided
    const customErrorHandler = this.config.workerOptions?.customErrorHandler;
    if (customErrorHandler) {
      try {
        await customErrorHandler(error, job, this.connection);
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
    await this.connection.collection.updateOne(
      { _id: new ObjectId(jobId) },
      {
        $push: { errors: errorEntry },
      }
    );

    // Check if we should retry
    if (job.attempts <= jobConfig.maxRetries) {
      // Calculate exponential backoff
      const backoffMs = Math.min(Math.pow(2, job.attempts) * 1000, jobConfig.maxBackoffMs);

      const nextRunAt = new Date(Date.now() + backoffMs);

      await this.connection.collection.updateOne(
        { _id: new ObjectId(jobId) },
        {
          $set: {
            status: 'pending',
            nextRunAt,
          },
        }
      );

      console.log(`🔄 Job ${jobId} scheduled for retry in ${backoffMs}ms`);
    } else {
      // Max retries exceeded, mark as failed
      await this.connection.collection.updateOne(
        { _id: new ObjectId(jobId) },
        {
          $set: {
            status: 'failed',
            completedAt: new Date(),
          },
        }
      );

      console.log(`💀 Job ${jobId} failed permanently after ${job.attempts} attempts`);
    }
  }
}
