import { ObjectId } from 'mongodb';

/**
 * Job status enum
 */
export type JobStatus = 'pending' | 'processing' | 'succeeded' | 'failed';

/**
 * Error entry for job execution history
 */
export interface JobError {
  attempt: number;
  error: string;
  timestamp: Date;
  // we will need to collect stack trace for each error to be able to debug the job.
  stackTrace: string;
}

/**
 * MongoDB job document schema
 */
export interface JobDocument<TPayload = unknown> {
  _id: ObjectId;
  name: string;
  payload: TPayload;
  metadata?: Record<string, unknown>; // Optional metadata for tracking job origins (e.g., Kafka headers, source info)
  status: JobStatus;
  priority?: number; // we need to implement sorting in db by priority so we will spend less db efforts on querying jobs. so when we query pending jobs we will be sure that we are getting the highest priority jobs first.
  attempts: number;
  maxRetries: number;
  maxBackoffMs: number;
  maxRunningDurationMs?: number; // Maximum time this job can run before being considered stuck
  errors: JobError[];
  createdAt: Date;
  processedAt?: Date;
  nextRunAt?: Date;
  lastRunAt?: Date;
  stuckAfter?: Date; // Computed field: when this job should be considered stuck (processedAt + maxRunningDurationMs)
  result?: {
    id: ObjectId;
    type: string;
  };
}

/**
 * Job processor function type
 */
export type JobProcessor<TPayload = unknown> = (
  payload: TPayload,
  context: JobContext
) => Promise<void>;

/**
 * Context provided to job processors during execution
 */
export interface JobContext {
  jobId: string;
  attempt: number;
  jobType: string;
}

/**
 * Configuration for a specific job type
 */
export interface JobConfig<TPayload = unknown> {
  name: string;
  processor: JobProcessor<TPayload>;
  maxRetries: number;
  maxBackoffMs: number;
  priority?: number;
  cron?: string; // Cron expression for scheduled jobs
  maxRunningDurationMs?: number; // Maximum time a job can run before being considered stuck (in milliseconds)
}

/**
 * Input for enqueueing a job
 */
export interface JobInput<TPayload = unknown> {
  name: string;
  payload: TPayload;
  metadata?: Record<string, unknown>; // Optional metadata for tracking job origins (e.g., Kafka headers, source info)
  priority?: number;
  maxRetries?: number;
  maxBackoffMs?: number;
  cron?: string; // For scheduled jobs
  maxRunningDurationMs?: number; // Override job type's max running duration
}

/**
 * Worker configuration options
 */
export interface WorkerOptions {
  pollIntervalMs?: number; // Default: 5000 (5 seconds)
  concurrency?: number; // Default: 1
  jobNames?: string[]; // If specified, only process these job names
  stuckJobTimeoutMs?: number; // Default: 24 hours - jobs stuck longer than this will be reset to pending
  customErrorHandler?: CustomErrorHandler;
}

export interface CustomErrorHandler {
  (error: Error, job: JobDocument, adapter: DatabaseAdapter): Promise<void>;
}

/**
 * Database adapter configuration
 */
export interface DatabaseConfig {
  type: 'mongodb';
  url: string;
  dbName: string;
  collectionName?: string; // Default: 'job-queue'
}

/**
 * Main Dren configuration
 */
export interface DrenConfig {
  database: DatabaseConfig;
  jobConfigs: Map<string, JobConfig<any>>; // Map for efficient job config lookup
  workerOptions?: WorkerOptions;
}

/**
 * Internal worker state
 */
export interface WorkerState {
  isRunning: boolean;
  isStopping: boolean;
  pollTimer?: NodeJS.Timeout; // Polling timer for idle state
  activeJobs: Set<string>; // Track in-flight job IDs
}

/**
 * Database connection interface - will be extended for different DB types
 */
export interface DatabaseConnection {
  type: string;
  adapter: DatabaseAdapter;
  isConnected(): boolean;
}

/**
 * Database adapter interface for future extensibility
 */
export interface DatabaseAdapter {
  connect(): Promise<DatabaseConnection>;
  disconnect(): Promise<void>;
  createIndexes(): Promise<void>;

  // Job CRUD operations
  createJob<T>(jobDoc: Omit<JobDocument<T>, '_id'>): Promise<string>;
  createJobs<T>(jobDocs: Omit<JobDocument<T>, '_id'>[]): Promise<string[]>;
  findJobById(jobId: string): Promise<JobDocument | null>;
  findJobsByStatus(status: JobStatus, limit?: number): Promise<JobDocument[]>;
  findJobsByPriority(maxPriority: number): Promise<JobDocument[]>;
  findStuckJobs(): Promise<JobDocument[]>;

  // Job updates
  updateJobStatus(jobId: string, status: JobStatus, updates?: Partial<JobDocument>): Promise<void>;
  incrementJobAttempts(jobId: string): Promise<void>;
  addJobError(
    jobId: string,
    error: { attempt: number; error: string; timestamp: Date; stackTrace: string }
  ): Promise<void>;
  setJobNextRunAt(jobId: string, nextRunAt: Date): Promise<void>;

  // Atomic operations
  findAndLockJob(jobNames?: string[]): Promise<JobDocument | null>;
  resetStuckJobs(): Promise<number>;

  // Collection management
  getCollectionName(): string;
  getDatabaseName(): string;
}

/**
 * Job registry - maps job name to its configuration
 */
export type JobRegistry = Map<string, JobConfig>;
