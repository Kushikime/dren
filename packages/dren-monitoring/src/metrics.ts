import { MongoClient, Db, Collection } from 'mongodb';
import type { JobDocument } from 'dren';
import type { JobMetrics, JobTypeMetrics, TimeRange, DashboardData, ChartData } from './types.js';

/**
 * Metrics service for analyzing job queue performance
 */
export class MetricsService {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  private collection: Collection<JobDocument> | null = null;

  constructor(
    private config: {
      url: string;
      dbName: string;
      collectionName?: string;
    }
  ) {}

  async connect(): Promise<void> {
    this.client = new MongoClient(this.config.url);
    await this.client.connect();
    this.db = this.client.db(this.config.dbName);
    this.collection = this.db.collection<JobDocument>(this.config.collectionName || 'job-queue');
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      this.collection = null;
    }
  }

  /**
   * Get overall job metrics for a time range
   */
  async getJobMetrics(timeRange: TimeRange): Promise<JobMetrics> {
    if (!this.collection) throw new Error('Not connected to database');

    const pipeline = [
      {
        $match: {
          createdAt: {
            $gte: timeRange.startDate,
            $lte: timeRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 },
          avgProcessingTime: {
            $avg: {
              $cond: [
                { $and: ['$processedAt', '$createdAt'] },
                {
                  $subtract: ['$processedAt', '$createdAt'],
                },
                null,
              ],
            },
          },
        },
      },
    ];

    const results = await this.collection.aggregate(pipeline).toArray();

    const metrics: JobMetrics = {
      totalJobs: 0,
      successfulJobs: 0,
      failedJobs: 0,
      pendingJobs: 0,
      processingJobs: 0,
      averageProcessingTime: 0,
      successRate: 0,
      failureRate: 0,
    };

    let totalProcessingTime = 0;
    let processedJobs = 0;

    for (const result of results) {
      const count = result.count;
      const avgTime = result.avgProcessingTime || 0;

      metrics.totalJobs += count;

      switch (result._id) {
        case 'succeeded':
          metrics.successfulJobs = count;
          totalProcessingTime += avgTime * count;
          processedJobs += count;
          break;
        case 'failed':
          metrics.failedJobs = count;
          totalProcessingTime += avgTime * count;
          processedJobs += count;
          break;
        case 'pending':
          metrics.pendingJobs = count;
          break;
        case 'processing':
          metrics.processingJobs = count;
          break;
      }
    }

    if (processedJobs > 0) {
      metrics.averageProcessingTime = totalProcessingTime / processedJobs;
    }

    if (metrics.totalJobs > 0) {
      metrics.successRate = (metrics.successfulJobs / metrics.totalJobs) * 100;
      metrics.failureRate = (metrics.failedJobs / metrics.totalJobs) * 100;
    }

    return metrics;
  }

  /**
   * Get job type specific metrics
   */
  async getJobTypeMetrics(timeRange: TimeRange): Promise<JobTypeMetrics[]> {
    if (!this.collection) throw new Error('Not connected to database');

    const pipeline = [
      {
        $match: {
          createdAt: {
            $gte: timeRange.startDate,
            $lte: timeRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: '$name',
          totalJobs: { $sum: 1 },
          successfulJobs: {
            $sum: { $cond: [{ $eq: ['$status', 'succeeded'] }, 1, 0] },
          },
          failedJobs: {
            $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] },
          },
          processingTimes: {
            $push: {
              $cond: [
                { $and: ['$processedAt', '$createdAt'] },
                { $subtract: ['$processedAt', '$createdAt'] },
                null,
              ],
            },
          },
        },
      },
    ];

    const results = await this.collection.aggregate(pipeline).toArray();

    return results.map(result => {
      const processingTimes = result.processingTimes.filter(
        (time: number | null) => time !== null
      ) as number[];

      const metrics: JobTypeMetrics = {
        jobName: result._id,
        totalJobs: result.totalJobs,
        successfulJobs: result.successfulJobs,
        failedJobs: result.failedJobs,
        averageProcessingTime: 0,
        successRate: 0,
        failureRate: 0,
        minProcessingTime: 0,
        maxProcessingTime: 0,
        medianProcessingTime: 0,
        p95ProcessingTime: 0,
      };

      if (processingTimes.length > 0) {
        processingTimes.sort((a, b) => a - b);

        metrics.averageProcessingTime =
          processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length;
        metrics.minProcessingTime = processingTimes[0];
        metrics.maxProcessingTime = processingTimes[processingTimes.length - 1];
        metrics.medianProcessingTime = processingTimes[Math.floor(processingTimes.length / 2)];
        metrics.p95ProcessingTime = processingTimes[Math.floor(processingTimes.length * 0.95)];
      }

      if (result.totalJobs > 0) {
        metrics.successRate = (result.successfulJobs / result.totalJobs) * 100;
        metrics.failureRate = (result.failedJobs / result.totalJobs) * 100;
      }

      return metrics;
    });
  }

  /**
   * Get processing time chart data
   */
  async getProcessingTimeChart(timeRange: TimeRange): Promise<ChartData> {
    const jobTypeMetrics = await this.getJobTypeMetrics(timeRange);

    return {
      labels: jobTypeMetrics.map(m => m.jobName),
      datasets: [
        {
          label: 'Average Processing Time (ms)',
          data: jobTypeMetrics.map(m => m.averageProcessingTime),
          backgroundColor: 'rgba(54, 162, 235, 0.2)',
          borderColor: 'rgba(54, 162, 235, 1)',
        },
      ],
    };
  }

  /**
   * Get success rate chart data
   */
  async getSuccessRateChart(timeRange: TimeRange): Promise<ChartData> {
    const jobTypeMetrics = await this.getJobTypeMetrics(timeRange);

    return {
      labels: jobTypeMetrics.map(m => m.jobName),
      datasets: [
        {
          label: 'Success Rate (%)',
          data: jobTypeMetrics.map(m => m.successRate),
          backgroundColor: 'rgba(75, 192, 192, 0.2)',
          borderColor: 'rgba(75, 192, 192, 1)',
        },
      ],
    };
  }

  /**
   * Get job volume chart data (jobs per hour)
   */
  async getJobVolumeChart(timeRange: TimeRange): Promise<ChartData> {
    if (!this.collection) throw new Error('Not connected to database');

    const pipeline = [
      {
        $match: {
          createdAt: {
            $gte: timeRange.startDate,
            $lte: timeRange.endDate,
          },
        },
      },
      {
        $group: {
          _id: {
            hour: { $hour: '$createdAt' },
            day: { $dayOfMonth: '$createdAt' },
            month: { $month: '$createdAt' },
          },
          count: { $sum: 1 },
        },
      },
      {
        $sort: { '_id.month': 1, '_id.day': 1, '_id.hour': 1 },
      },
    ];

    const results = await this.collection.aggregate(pipeline).toArray();

    return {
      labels: results.map(r => `${r._id.month}/${r._id.day} ${r._id.hour}:00`),
      datasets: [
        {
          label: 'Jobs per Hour',
          data: results.map(r => r.count),
          backgroundColor: 'rgba(255, 99, 132, 0.2)',
          borderColor: 'rgba(255, 99, 132, 1)',
        },
      ],
    };
  }

  /**
   * Get complete dashboard data
   */
  async getDashboardData(timeRange: TimeRange): Promise<DashboardData> {
    const [overallMetrics, jobTypeMetrics, processingTimeChart, successRateChart, jobVolumeChart] =
      await Promise.all([
        this.getJobMetrics(timeRange),
        this.getJobTypeMetrics(timeRange),
        this.getProcessingTimeChart(timeRange),
        this.getSuccessRateChart(timeRange),
        this.getJobVolumeChart(timeRange),
      ]);

    return {
      timeRange,
      overallMetrics,
      jobTypeMetrics,
      processingTimeChart,
      successRateChart,
      jobVolumeChart,
    };
  }
}
