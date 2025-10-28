import type { JobDocument, JobStatus } from '../types.js';

/**
 * Base database adapter interface defining common operations
 * All database adapters must implement this interface
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
 * Database connection interface
 */
export interface DatabaseConnection {
  type: string;
  adapter: DatabaseAdapter;
  isConnected(): boolean;
}

/**
 * Database configuration interface
 */
export interface DatabaseConfig {
  type: string;
  url: string;
  dbName: string;
  collectionName?: string;
}
