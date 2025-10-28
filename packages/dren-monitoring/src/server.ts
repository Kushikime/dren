import express from 'express';
import cors from 'cors';
import { MetricsService } from './metrics.js';
import type { MonitoringConfig, TimeRange } from './types.js';

/**
 * Monitoring web server
 */
export class MonitoringServer {
  private app: express.Application;
  private metricsService: MetricsService;
  private server: any = null;

  constructor(private config: MonitoringConfig) {
    this.app = express();
    this.metricsService = new MetricsService({
      url: config.database.url,
      dbName: config.database.dbName,
      collectionName: config.database.collectionName,
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static('public'));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date() });
    });

    // Get dashboard data
    this.app.get('/api/dashboard', async (req, res) => {
      try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const timeRange: TimeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string),
        };

        const dashboardData = await this.metricsService.getDashboardData(timeRange);
        res.json(dashboardData);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get job metrics
    this.app.get('/api/metrics', async (req, res) => {
      try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const timeRange: TimeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string),
        };

        const metrics = await this.metricsService.getJobMetrics(timeRange);
        res.json(metrics);
      } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get job type metrics
    this.app.get('/api/job-types', async (req, res) => {
      try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const timeRange: TimeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string),
        };

        const jobTypeMetrics = await this.metricsService.getJobTypeMetrics(timeRange);
        res.json(jobTypeMetrics);
      } catch (error) {
        console.error('Error fetching job type metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get processing time chart data
    this.app.get('/api/charts/processing-time', async (req, res) => {
      try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const timeRange: TimeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string),
        };

        const chartData = await this.metricsService.getProcessingTimeChart(timeRange);
        res.json(chartData);
      } catch (error) {
        console.error('Error fetching processing time chart:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get success rate chart data
    this.app.get('/api/charts/success-rate', async (req, res) => {
      try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const timeRange: TimeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string),
        };

        const chartData = await this.metricsService.getSuccessRateChart(timeRange);
        res.json(chartData);
      } catch (error) {
        console.error('Error fetching success rate chart:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get job volume chart data
    this.app.get('/api/charts/job-volume', async (req, res) => {
      try {
        const { startDate, endDate } = req.query;

        if (!startDate || !endDate) {
          return res.status(400).json({ error: 'startDate and endDate are required' });
        }

        const timeRange: TimeRange = {
          startDate: new Date(startDate as string),
          endDate: new Date(endDate as string),
        };

        const chartData = await this.metricsService.getJobVolumeChart(timeRange);
        res.json(chartData);
      } catch (error) {
        console.error('Error fetching job volume chart:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  async start(): Promise<void> {
    await this.metricsService.connect();

    const port = this.config.server?.port || 3001;
    const host = this.config.server?.host || 'localhost';

    this.server = this.app.listen(port, host, () => {
      console.log(`🚀 Dren Monitoring Server running on http://${host}:${port}`);
      console.log(`📊 Dashboard available at http://${host}:${port}`);
    });
  }

  async stop(): Promise<void> {
    if (this.server) {
      await new Promise<void>(resolve => {
        this.server.close(() => resolve());
      });
    }
    await this.metricsService.disconnect();
  }
}
