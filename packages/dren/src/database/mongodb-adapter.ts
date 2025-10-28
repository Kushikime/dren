import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import type {
  DatabaseAdapter,
  DatabaseConnection,
  DatabaseConfig,
  JobDocument,
  JobStatus,
} from '../types.js';

/**
 * MongoDB adapter implementation
 * Extends the base DatabaseAdapter interface with MongoDB-specific operations
 */
export class MongoDBAdapter implements DatabaseAdapter {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<JobDocument> | null = null;

  constructor(private config: DatabaseConfig) {}

  async connect(): Promise<DatabaseConnection> {
    this.client = new MongoClient(this.config.url);
    await this.client.connect();

    this.db = this.client.db(this.config.dbName);
    this.collection = this.db.collection<JobDocument>(this.config.collectionName || 'job-queue');

    return {
      type: 'mongodb',
      adapter: this,
      isConnected: () => this.client !== null,
    };
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
    }
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

    // Scheduled jobs index - for cron jobs
    await this.collection.createIndex(
      {
        status: 1,
        nextRunAt: 1,
      },
      {
        name: 'scheduled_index',
        background: true,
      }
    );

    // Stuck jobs index - for stuck job recovery
    await this.collection.createIndex(
      {
        status: 1,
        stuckAfter: 1,
      },
      {
        name: 'stuck_jobs_index',
        background: true,
      }
    );

    // Job name index - for filtering by job type
    await this.collection.createIndex(
      {
        name: 1,
        status: 1,
      },
      {
        name: 'job_name_index',
        background: true,
      }
    );

    console.log('✅ MongoDB indexes created successfully');
  }

  // Job CRUD operations
  async createJob<T>(jobDoc: Omit<JobDocument<T>, '_id'>): Promise<string> {
    if (!this.collection) throw new Error('Not connected to database');

    const result = await this.collection.insertOne(jobDoc as JobDocument<T>);
    return result.insertedId.toString();
  }

  async createJobs<T>(jobDocs: Omit<JobDocument<T>, '_id'>[]): Promise<string[]> {
    if (!this.collection) throw new Error('Not connected to database');

    const result = await this.collection.insertMany(jobDocs as JobDocument<T>[]);
    return Object.values(result.insertedIds).map(id => id.toString());
  }

  async findJobById(jobId: string): Promise<JobDocument | null> {
    if (!this.collection) throw new Error('Not connected to database');

    return await this.collection.findOne({ _id: new ObjectId(jobId) });
  }

  async findJobsByStatus(status: JobStatus, limit: number = 100): Promise<JobDocument[]> {
    if (!this.collection) throw new Error('Not connected to database');

    return await this.collection.find({ status }).limit(limit).toArray();
  }

  async findJobsByPriority(maxPriority: number): Promise<JobDocument[]> {
    if (!this.collection) throw new Error('Not connected to database');

    return await this.collection
      .find({
        status: 'pending',
        $or: [{ priority: { $lte: maxPriority } }, { priority: { $exists: false } }],
      })
      .sort({ priority: 1, createdAt: 1 })
      .toArray();
  }

  async findStuckJobs(): Promise<JobDocument[]> {
    if (!this.collection) throw new Error('Not connected to database');

    const now = new Date();
    return await this.collection
      .find({
        status: 'processing',
        stuckAfter: { $lte: now },
      })
      .toArray();
  }

  // Job updates
  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    updates: Partial<JobDocument> = {}
  ): Promise<void> {
    if (!this.collection) throw new Error('Not connected to database');

    await this.collection.updateOne({ _id: new ObjectId(jobId) }, { $set: { status, ...updates } });
  }

  async incrementJobAttempts(jobId: string): Promise<void> {
    if (!this.collection) throw new Error('Not connected to database');

    await this.collection.updateOne({ _id: new ObjectId(jobId) }, { $inc: { attempts: 1 } });
  }

  async addJobError(
    jobId: string,
    error: { attempt: number; error: string; timestamp: Date; stackTrace: string }
  ): Promise<void> {
    if (!this.collection) throw new Error('Not connected to database');

    await this.collection.updateOne({ _id: new ObjectId(jobId) }, { $push: { errors: error } });
  }

  async setJobNextRunAt(jobId: string, nextRunAt: Date): Promise<void> {
    if (!this.collection) throw new Error('Not connected to database');

    await this.collection.updateOne({ _id: new ObjectId(jobId) }, { $set: { nextRunAt } });
  }

  // Atomic operations
  async findAndLockJob(jobNames?: string[]): Promise<JobDocument | null> {
    if (!this.collection) throw new Error('Not connected to database');

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

    // Find the highest priority job
    const highestPriorityJob = await this.collection.findOne(baseQuery, {
      sort: { priority: 1, createdAt: 1 },
    });

    if (!highestPriorityJob) {
      return null; // No jobs available
    }

    // Check if there are ANY higher priority jobs still pending or processing
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

    const higherPriorityExists = await this.collection.findOne(higherPriorityQuery);

    if (higherPriorityExists) {
      // There are higher priority jobs still pending or processing, don't process this job yet
      console.log(
        `⏳ Skipping priority ${highestPriorityJob.priority || 999} job - higher priority jobs still active`
      );
      return null;
    }

    // Try to atomically lock the job
    const lockedJob = await this.collection.findOneAndUpdate(
      {
        _id: highestPriorityJob._id,
        status: 'pending',
      },
      {
        $set: {
          status: 'processing',
          processedAt: now,
          lastRunAt: now,
          stuckAfter: highestPriorityJob.maxRunningDurationMs
            ? new Date(now.getTime() + highestPriorityJob.maxRunningDurationMs)
            : undefined,
        },
        $inc: { attempts: 1 },
      },
      {
        returnDocument: 'after',
      }
    );

    return lockedJob;
  }

  async resetStuckJobs(): Promise<number> {
    if (!this.collection) throw new Error('Not connected to database');

    const now = new Date();
    const stuckJobs = await this.findStuckJobs();

    let resetCount = 0;

    for (const job of stuckJobs) {
      const maxRunningDurationMs = job.maxRunningDurationMs || 300000; // Default 5 minutes
      if (!job.processedAt) continue; // Skip jobs without processedAt
      const runningDuration = now.getTime() - job.processedAt.getTime();

      console.warn(
        `⚠️  Job ${job._id} (${job.name}) has been running for ${Math.round(runningDuration / 1000)}s (max: ${Math.round(maxRunningDurationMs / 1000)}s), resetting to pending`
      );

      await this.collection.updateOne(
        { _id: job._id },
        {
          $set: {
            status: 'pending',
            processedAt: undefined,
            stuckAfter: undefined,
          },
          $push: {
            errors: {
              attempt: job.attempts,
              error: `Job stuck for ${Math.round(runningDuration / 1000)}s, reset to pending`,
              timestamp: now,
              stackTrace: '',
            },
          },
        }
      );

      resetCount++;
    }

    if (resetCount > 0) {
      console.log(`🔄 Reset ${resetCount} stuck jobs to pending status`);
    }

    return resetCount;
  }

  // Collection management
  getCollectionName(): string {
    return this.config.collectionName || 'job-queue';
  }

  getDatabaseName(): string {
    return this.config.dbName;
  }

  // MongoDB-specific getters for backward compatibility
  get mongoClient(): MongoClient | null {
    return this.client;
  }

  get mongoDatabase(): Db | null {
    return this.db;
  }

  get mongoCollection(): Collection<JobDocument> | null {
    return this.collection;
  }
}
