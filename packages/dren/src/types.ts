import { MongoClient, Db, Collection, ObjectId } from 'mongodb';

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
  jobConfigs: Map<string, JobConfig>; // Map for efficient job config lookup
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
  type: 'mongodb';
  client: MongoClient;
  db: Db;
  collection: Collection<JobDocument>;
}

/**
 * Database adapter interface for future extensibility
 */
export interface DatabaseAdapter {
  connect(): Promise<DatabaseConnection>;
  createIndexes(): Promise<void>;
  disconnect(): Promise<void>;
}

/**
 * Job registry - maps job name to its configuration
 */
export type JobRegistry = Map<string, JobConfig>;
