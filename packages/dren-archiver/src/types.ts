import type { JobDocument } from 'dren';

/**
 * Archived job document with shard key
 */
export interface ArchivedJobDocument extends JobDocument {
  shardKey: string; // Format: YYYY-MM-DD (e.g., "2025-10-28")
  archivedAt: Date;
  originalCollection: string; // Original collection name (e.g., "job-queue")
}

/**
 * Archiver configuration
 */
export interface ArchiverConfig {
  database: {
    type: 'mongodb';
    url: string;
    dbName: string;
    mainCollectionName?: string; // Default: 'job-queue'
    archiveCollectionPrefix?: string; // Default: 'job-archive'
  };
  schedule?: {
    cronExpression?: string; // Default: '0 2 * * *' (2 AM daily)
    timezone?: string; // Default: 'UTC'
  };
  retention?: {
    archiveAfterDays?: number; // Default: 1 (archive jobs older than 1 day)
    deleteAfterDays?: number; // Default: 90 (delete archives older than 90 days)
  };
  batchSize?: number; // Default: 1000
}

/**
 * Archiving statistics
 */
export interface ArchivingStats {
  date: string; // YYYY-MM-DD format
  jobsArchived: number;
  jobsDeleted: number;
  archiveCollectionName: string;
  processingTimeMs: number;
  errors: string[];
}

/**
 * Archive collection info
 */
export interface ArchiveCollectionInfo {
  collectionName: string;
  shardKey: string;
  jobCount: number;
  dateRange: {
    earliest: Date;
    latest: Date;
  };
  createdAt: Date;
}

/**
 * Archiver status
 */
export interface ArchiverStatus {
  isRunning: boolean;
  lastRun?: Date;
  nextRun?: Date;
  totalJobsArchived: number;
  totalJobsDeleted: number;
  archiveCollections: ArchiveCollectionInfo[];
  errors: string[];
}
