import type { JobDocument } from 'dren';

/**
 * Execution timing data for detailed job monitoring
 */
export interface ExecutionTiming {
  method: string;
  startTime: Date;
  endTime: Date;
  duration: number; // milliseconds
  metadata?: Record<string, unknown>;
}

/**
 * Enhanced job document with execution timing data
 */
export interface MonitoredJobDocument extends JobDocument {
  executionTimings?: ExecutionTiming[];
  totalExecutionTime?: number;
  methodBreakdown?: Record<string, number>;
}

/**
 * Job metrics for a specific time period
 */
export interface JobMetrics {
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  pendingJobs: number;
  processingJobs: number;
  averageProcessingTime: number;
  successRate: number;
  failureRate: number;
}

/**
 * Job type specific metrics
 */
export interface JobTypeMetrics {
  jobName: string;
  totalJobs: number;
  successfulJobs: number;
  failedJobs: number;
  averageProcessingTime: number;
  successRate: number;
  failureRate: number;
  minProcessingTime: number;
  maxProcessingTime: number;
  medianProcessingTime: number;
  p95ProcessingTime: number;
}

/**
 * Time range for metrics queries
 */
export interface TimeRange {
  startDate: Date;
  endDate: Date;
}

/**
 * Monitoring configuration
 */
export interface MonitoringConfig {
  database: {
    type: 'mongodb';
    url: string;
    dbName: string;
    collectionName?: string;
  };
  server?: {
    port?: number;
    host?: string;
  };
}

/**
 * Chart data for UI
 */
export interface ChartData {
  labels: string[];
  datasets: {
    label: string;
    data: number[];
    backgroundColor?: string;
    borderColor?: string;
  }[];
}

/**
 * Dashboard data
 */
export interface DashboardData {
  timeRange: TimeRange;
  overallMetrics: JobMetrics;
  jobTypeMetrics: JobTypeMetrics[];
  processingTimeChart: ChartData;
  successRateChart: ChartData;
  jobVolumeChart: ChartData;
}
