import type {
  DrenConfig,
  DatabaseConnection,
  JobDocument,
  JobInput,
  JobRegistry,
  DatabaseAdapter,
} from './types.js';
import { DatabaseFactory } from './database/database-factory.js';
import { JobService } from './services/job-service.js';
import { WorkerService } from './services/worker-service.js';

/**
 * Main Dren job queue class - now refactored with modular architecture
 * Orchestrates database, job, and worker services
 */
export class Dren {
  private adapter: DatabaseAdapter;
  private connection: DatabaseConnection | null = null;
  private jobRegistry: JobRegistry = new Map();
  private jobService: JobService | null = null;
  private workerService: WorkerService | null = null;

  constructor(private config: DrenConfig) {
    // Create database adapter using factory
    this.adapter = DatabaseFactory.createAdapter(config.database);

    // Initialize job registry
    this.jobRegistry = config.jobConfigs;
  }

  /**
   * Initialize Dren - connect to database and create indexes
   */
  async initialize(): Promise<void> {
    console.log('🚀 Initializing Dren...');

    // Connect to database
    this.connection = await this.adapter.connect();
    console.log('✅ Database connected');

    // Create indexes
    await this.adapter.createIndexes();
    console.log('✅ Database indexes created');

    // Initialize services
    this.jobService = new JobService(this.adapter);
    this.workerService = new WorkerService(
      this.adapter,
      this.jobRegistry,
      this.config.workerOptions
    );

    console.log('✅ Dren initialized successfully');
  }

  /**
   * Start the worker
   */
  async start(): Promise<void> {
    if (!this.workerService) {
      throw new Error('Dren not initialized. Call initialize() first.');
    }
    await this.workerService.start();
  }

  /**
   * Stop the worker gracefully
   */
  async stop(): Promise<void> {
    if (!this.workerService) {
      throw new Error('Dren not initialized. Call initialize() first.');
    }
    await this.workerService.stop();
  }

  /**
   * Enqueue a single job
   */
  async enqueue<T>(jobInput: JobInput<T>): Promise<string> {
    if (!this.jobService) {
      throw new Error('Dren not initialized. Call initialize() first.');
    }

    const jobConfig = this.jobRegistry.get(jobInput.name);
    if (!jobConfig) {
      throw new Error(`Job type '${jobInput.name}' not registered`);
    }

    return await this.jobService.enqueue(jobInput, jobConfig);
  }

  /**
   * Enqueue multiple jobs
   */
  async enqueueBatch<T>(jobs: JobInput<T>[]): Promise<string[]> {
    if (!this.jobService) {
      throw new Error('Dren not initialized. Call initialize() first.');
    }

    return await this.jobService.enqueueBatch(jobs, this.jobRegistry);
  }

  /**
   * Get job by ID
   */
  async getJob(jobId: string): Promise<JobDocument | null> {
    if (!this.jobService) {
      throw new Error('Dren not initialized. Call initialize() first.');
    }

    return await this.jobService.getJob(jobId);
  }

  /**
   * Get jobs by status
   */
  async getJobsByStatus(
    status: 'pending' | 'processing' | 'succeeded' | 'failed',
    limit?: number
  ): Promise<JobDocument[]> {
    if (!this.jobService) {
      throw new Error('Dren not initialized. Call initialize() first.');
    }

    return await this.jobService.getJobsByStatus(status, limit);
  }

  /**
   * Disconnect from database
   */
  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.adapter.disconnect();
      this.connection = null;
      this.jobService = null;
      this.workerService = null;
      console.log('🔌 Disconnected from database');
    }
  }

  /**
   * Get worker state
   */
  getWorkerState() {
    if (!this.workerService) {
      throw new Error('Dren not initialized. Call initialize() first.');
    }

    return this.workerService.getState();
  }

  /**
   * Get database connection (for backward compatibility)
   */
  get dbConnection(): DatabaseConnection | null {
    return this.connection;
  }

  /**
   * Get database adapter (for advanced usage)
   */
  get databaseAdapter(): DatabaseAdapter {
    return this.adapter;
  }
}
