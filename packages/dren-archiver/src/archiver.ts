import { MongoClient, Db, Collection } from 'mongodb';
import * as cron from 'node-cron';
import type { JobDocument } from 'dren';
import type {
  ArchiverConfig,
  ArchivedJobDocument,
  ArchivingStats,
  ArchiveCollectionInfo,
  ArchiverStatus,
} from './types.js';

/**
 * Job archiver service for managing job lifecycle and cleanup
 */
export class JobArchiver {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private mainCollection: Collection<JobDocument> | null = null;
  private cronTask: cron.ScheduledTask | null = null;
  private isRunning = false;
  private lastRun: Date | undefined;
  private nextRun: Date | undefined;
  private totalJobsArchived = 0;
  private totalJobsDeleted = 0;
  private errors: string[] = [];

  constructor(private config: ArchiverConfig) {}

  async connect(): Promise<void> {
    this.client = new MongoClient(this.config.database.url);
    await this.client.connect();
    this.db = this.client.db(this.config.database.dbName);
    this.mainCollection = this.db.collection<JobDocument>(
      this.config.database.mainCollectionName || 'job-queue'
    );
  }

  async disconnect(): Promise<void> {
    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }

    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.mainCollection = null;
    }
  }

  /**
   * Start the archiver with scheduled runs
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log('⚠️  Archiver is already running');
      return;
    }

    const cronExpression = this.config.schedule?.cronExpression || '0 2 * * *'; // 2 AM daily
    const timezone = this.config.schedule?.timezone || 'UTC';

    console.log(`🔄 Starting job archiver with schedule: ${cronExpression} (${timezone})`);

    this.cronTask = cron.schedule(
      cronExpression,
      async () => {
        await this.runArchiving();
      },
      {
        scheduled: false,
        timezone,
      }
    );

    this.cronTask.start();
    this.isRunning = true;

    // Calculate next run time
    this.calculateNextRun();

    console.log(`✅ Job archiver started. Next run: ${this.nextRun?.toISOString()}`);
  }

  /**
   * Stop the archiver
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      console.log('⚠️  Archiver is not running');
      return;
    }

    if (this.cronTask) {
      this.cronTask.stop();
      this.cronTask = null;
    }

    this.isRunning = false;
    console.log('🛑 Job archiver stopped');
  }

  /**
   * Run archiving process manually
   */
  async runArchiving(): Promise<ArchivingStats[]> {
    if (!this.db || !this.mainCollection) {
      throw new Error('Not connected to database');
    }

    console.log('🔄 Starting job archiving process...');
    const startTime = Date.now();

    const stats: ArchivingStats[] = [];
    const archiveAfterDays = this.config.retention?.archiveAfterDays || 1;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - archiveAfterDays);

    try {
      // Get all succeeded jobs older than the cutoff date
      const jobsToArchive = await this.mainCollection
        .find({
          status: 'succeeded',
          processedAt: { $lt: cutoffDate },
        })
        .toArray();

      if (jobsToArchive.length === 0) {
        console.log('📭 No jobs to archive');
        return stats;
      }

      console.log(`📦 Found ${jobsToArchive.length} jobs to archive`);

      // Group jobs by date for sharding
      const jobsByDate = this.groupJobsByDate(jobsToArchive);

      // Archive jobs by date
      for (const [date, jobs] of jobsByDate) {
        const dateStats = await this.archiveJobsForDate(date, jobs);
        stats.push(dateStats);
      }

      // Clean up old archives if configured
      if (this.config.retention?.deleteAfterDays) {
        await this.cleanupOldArchives();
      }

      this.lastRun = new Date();
      this.calculateNextRun();

      const totalTime = Date.now() - startTime;
      console.log(`✅ Archiving completed in ${totalTime}ms`);
      console.log(`📊 Archived ${stats.reduce((sum, s) => sum + s.jobsArchived, 0)} jobs`);
      console.log(`🗑️  Deleted ${stats.reduce((sum, s) => sum + s.jobsDeleted, 0)} jobs`);
    } catch (error) {
      const errorMsg = `Archiving failed: ${error instanceof Error ? error.message : String(error)}`;
      console.error('❌', errorMsg);
      this.errors.push(errorMsg);
    }

    return stats;
  }

  /**
   * Group jobs by their processing date for sharding
   */
  private groupJobsByDate(jobs: JobDocument[]): Map<string, JobDocument[]> {
    const jobsByDate = new Map<string, JobDocument[]>();

    for (const job of jobs) {
      if (!job.processedAt) continue;

      const dateKey = this.formatDateKey(job.processedAt);
      if (!jobsByDate.has(dateKey)) {
        jobsByDate.set(dateKey, []);
      }
      const dateJobs = jobsByDate.get(dateKey);
      if (dateJobs) {
        dateJobs.push(job);
      }
    }

    return jobsByDate;
  }

  /**
   * Format date as YYYY-MM-DD for shard key
   */
  private formatDateKey(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  /**
   * Archive jobs for a specific date
   */
  private async archiveJobsForDate(dateKey: string, jobs: JobDocument[]): Promise<ArchivingStats> {
    if (!this.db || !this.mainCollection) {
      throw new Error('Not connected to database');
    }

    const startTime = Date.now();
    const archiveCollectionName = this.getArchiveCollectionName(dateKey);
    const archiveCollection = this.db.collection<ArchivedJobDocument>(archiveCollectionName);

    // Create archive collection if it doesn't exist
    await this.ensureArchiveCollection(archiveCollectionName);

    const errors: string[] = [];
    let jobsArchived = 0;
    let jobsDeleted = 0;

    try {
      // Convert jobs to archived format
      const archivedJobs: ArchivedJobDocument[] = jobs.map(job => ({
        ...job,
        shardKey: dateKey,
        archivedAt: new Date(),
        originalCollection: this.config.database.mainCollectionName || 'job-queue',
      }));

      // Insert into archive collection
      const batchSize = this.config.batchSize || 1000;
      for (let i = 0; i < archivedJobs.length; i += batchSize) {
        const batch = archivedJobs.slice(i, i + batchSize);
        await archiveCollection.insertMany(batch);
        jobsArchived += batch.length;
      }

      // Delete from main collection
      const jobIds = jobs.map(job => job._id);
      const deleteResult = await this.mainCollection.deleteMany({
        _id: { $in: jobIds },
      });
      jobsDeleted = deleteResult.deletedCount;

      this.totalJobsArchived += jobsArchived;
      this.totalJobsDeleted += jobsDeleted;

      console.log(`📦 Archived ${jobsArchived} jobs for ${dateKey} to ${archiveCollectionName}`);
    } catch (error) {
      const errorMsg = `Failed to archive jobs for ${dateKey}: ${error instanceof Error ? error.message : String(error)}`;
      errors.push(errorMsg);
      console.error('❌', errorMsg);
    }

    return {
      date: dateKey,
      jobsArchived,
      jobsDeleted,
      archiveCollectionName,
      processingTimeMs: Date.now() - startTime,
      errors,
    };
  }

  /**
   * Get archive collection name for a date
   */
  private getArchiveCollectionName(dateKey: string): string {
    const prefix = this.config.database.archiveCollectionPrefix || 'job-archive';
    return `${prefix}-${dateKey}`;
  }

  /**
   * Ensure archive collection exists with proper indexes
   */
  private async ensureArchiveCollection(collectionName: string): Promise<void> {
    if (!this.db) throw new Error('Not connected to database');

    const collection = this.db.collection(collectionName);

    // Create indexes for efficient querying
    await collection.createIndex({ shardKey: 1 }, { background: true });
    await collection.createIndex({ archivedAt: 1 }, { background: true });
    await collection.createIndex({ name: 1, archivedAt: 1 }, { background: true });
    await collection.createIndex({ status: 1, archivedAt: 1 }, { background: true });
  }

  /**
   * Clean up old archive collections
   */
  private async cleanupOldArchives(): Promise<void> {
    if (!this.db) throw new Error('Not connected to database');

    const deleteAfterDays = this.config.retention?.deleteAfterDays || 90;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - deleteAfterDays);

    const collections = await this.db.listCollections().toArray();
    const prefix = this.config.database.archiveCollectionPrefix || 'job-archive';

    for (const collection of collections) {
      if (collection.name.startsWith(prefix)) {
        // Extract date from collection name
        const dateStr = collection.name.replace(`${prefix}-`, '');
        const collectionDate = new Date(dateStr);

        if (collectionDate < cutoffDate) {
          console.log(`🗑️  Dropping old archive collection: ${collection.name}`);
          await this.db.collection(collection.name).drop();
        }
      }
    }
  }

  /**
   * Calculate next run time based on cron expression
   */
  private calculateNextRun(): void {
    // This is a simplified calculation - in production you might want to use a proper cron parser
    const cronExpression = this.config.schedule?.cronExpression || '0 2 * * *';
    const now = new Date();

    // For daily runs at 2 AM, calculate next occurrence
    if (cronExpression === '0 2 * * *') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0);
      this.nextRun = tomorrow;
    }
  }

  /**
   * Get archiver status
   */
  async getStatus(): Promise<ArchiverStatus> {
    if (!this.db) {
      return {
        isRunning: this.isRunning,
        lastRun: this.lastRun,
        nextRun: this.nextRun,
        totalJobsArchived: this.totalJobsArchived,
        totalJobsDeleted: this.totalJobsDeleted,
        archiveCollections: [],
        errors: this.errors,
      };
    }

    // Get archive collection info
    const collections = await this.db.listCollections().toArray();
    const prefix = this.config.database.archiveCollectionPrefix || 'job-archive';
    const archiveCollections: ArchiveCollectionInfo[] = [];

    for (const collection of collections) {
      if (collection.name.startsWith(prefix)) {
        const coll = this.db.collection(collection.name);
        const count = await coll.countDocuments();

        if (count > 0) {
          const stats = await coll
            .aggregate([
              {
                $group: {
                  _id: null,
                  earliest: { $min: '$archivedAt' },
                  latest: { $max: '$archivedAt' },
                },
              },
            ])
            .toArray();

          const dateStr = collection.name.replace(`${prefix}-`, '');
          const createdAt = new Date(dateStr);

          archiveCollections.push({
            collectionName: collection.name,
            shardKey: dateStr,
            jobCount: count,
            dateRange: {
              earliest: stats[0]?.earliest || createdAt,
              latest: stats[0]?.latest || createdAt,
            },
            createdAt,
          });
        }
      }
    }

    return {
      isRunning: this.isRunning,
      lastRun: this.lastRun,
      nextRun: this.nextRun,
      totalJobsArchived: this.totalJobsArchived,
      totalJobsDeleted: this.totalJobsDeleted,
      archiveCollections: archiveCollections.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
      ),
      errors: this.errors,
    };
  }

  /**
   * Get archived jobs for a specific date range
   */
  async getArchivedJobs(
    startDate: string,
    endDate: string,
    jobName?: string
  ): Promise<ArchivedJobDocument[]> {
    if (!this.db) throw new Error('Not connected to database');

    const results: ArchivedJobDocument[] = [];
    const prefix = this.config.database.archiveCollectionPrefix || 'job-archive';

    // Get all archive collections in the date range
    const collections = await this.db.listCollections().toArray();
    const relevantCollections = collections.filter(col => {
      if (!col.name.startsWith(prefix)) return false;

      const dateStr = col.name.replace(`${prefix}-`, '');
      return dateStr >= startDate && dateStr <= endDate;
    });

    // Query each relevant collection
    for (const collection of relevantCollections) {
      const coll = this.db.collection<ArchivedJobDocument>(collection.name);

      const query: Record<string, unknown> = {};
      if (jobName) {
        query.name = jobName;
      }

      const jobs = await coll.find(query).toArray();
      results.push(...jobs);
    }

    return results.sort((a, b) => b.archivedAt.getTime() - a.archivedAt.getTime());
  }
}
