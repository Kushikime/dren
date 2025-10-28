import { Dren } from 'dren';
import { ExecutionTimer, withTiming, createMonitoredProcessor } from '@dren/monitoring';
import { jobConfigs } from './job-configs';

// Example of manual execution timing
class DataProcessor {
  private timer = new ExecutionTimer();

  async validateData(payload: unknown): Promise<boolean> {
    // Simulate validation
    await new Promise(resolve => setTimeout(resolve, 1000));
    return Boolean(payload && (payload as Record<string, unknown>).data);
  }

  async processData(payload: unknown): Promise<unknown> {
    // Simulate processing
    await new Promise(resolve => setTimeout(resolve, 2000));
    return { processed: (payload as Record<string, unknown>).data, timestamp: new Date() };
  }

  async saveData(): Promise<string> {
    // Simulate saving
    await new Promise(resolve => setTimeout(resolve, 500));
    return `saved_${Date.now()}`;
  }

  async processWithManualTiming(payload: unknown): Promise<unknown> {
    this.timer.start('totalProcess');

    this.timer.start('validation');
    const isValid = await this.validateData(payload);
    this.timer.end();

    if (!isValid) {
      this.timer.end(); // End total process if validation fails
      throw new Error('Invalid payload');
    }

    this.timer.start('processing');
    const processedData = await this.processData(payload);
    this.timer.end();

    this.timer.start('saving');
    const saveId = await this.saveData();
    this.timer.end();

    this.timer.end(); // End total process

    return {
      result: processedData,
      saveId,
      executionTimings: this.timer.getTimings(),
      totalExecutionTime: this.timer.getTotalExecutionTime(),
    };
  }
}

// Example of automatic timing with wrapper
const timer = new ExecutionTimer();
const timedDataProcessor = withTiming(
  async (data: unknown) => {
    // Simulate complex data processing
    await new Promise(resolve => setTimeout(resolve, 1500));

    // Simulate multiple steps
    const step1 = await new Promise(resolve => {
      setTimeout(() => resolve('step1_complete'), 300);
    });

    const step2 = await new Promise(resolve => {
      setTimeout(() => resolve('step2_complete'), 700);
    });

    const step3 = await new Promise(resolve => {
      setTimeout(() => resolve('step3_complete'), 500);
    });

    return {
      data,
      steps: [step1, step2, step3],
      processedAt: new Date(),
    };
  },
  'complexDataProcessor',
  timer
);

// Example of monitored processor
const monitoredEmailProcessor = createMonitoredProcessor(async (payload: unknown) => {
  const timer = new ExecutionTimer();

  timer.start('validateEmail');
  // Simulate email validation
  await new Promise(resolve => setTimeout(resolve, 200));
  timer.end();

  timer.start('prepareTemplate');
  // Simulate template preparation
  await new Promise(resolve => setTimeout(resolve, 300));
  timer.end();

  timer.start('sendEmail');
  // Simulate email sending
  await new Promise(resolve => setTimeout(resolve, 800));
  timer.end();

  timer.start('logActivity');
  // Simulate activity logging
  await new Promise(resolve => setTimeout(resolve, 100));
  timer.end();

  return {
    emailId: `email_${Date.now()}`,
    recipient: (payload as Record<string, unknown>).recipient,
    status: 'sent',
    executionTimings: timer.getTimings(),
    totalExecutionTime: timer.getTotalExecutionTime(),
  };
}, 'emailProcessor');

// Add monitoring examples to job configs
const monitoringJobConfigs = new Map<string, unknown>([
  ...Array.from(jobConfigs.entries()),
  [
    'manualTimingJob',
    {
      name: 'manualTimingJob',
      processor: async (payload: unknown) => {
        const processor = new DataProcessor();
        return await processor.processWithManualTiming(payload);
      },
      maxRetries: 2,
      maxBackoffMs: 3000,
      priority: 1,
    },
  ],
  [
    'automaticTimingJob',
    {
      name: 'automaticTimingJob',
      processor: timedDataProcessor,
      maxRetries: 2,
      maxBackoffMs: 3000,
      priority: 2,
    },
  ],
  [
    'monitoredEmailJob',
    {
      name: 'monitoredEmailJob',
      processor: monitoredEmailProcessor,
      maxRetries: 3,
      maxBackoffMs: 5000,
      priority: 1,
    },
  ],
]);

// Initialize Dren with monitoring examples
const dren = new Dren({
  database: {
    type: 'mongodb',
    url:
      process.env.MONGO_URL ||
      'mongodb://dren_user:dren_password@localhost:27018/dren_test?authSource=dren_test',
    dbName: process.env.DB_NAME || 'dren_test',
  },
  jobConfigs: monitoringJobConfigs as Map<string, unknown>,
  workerOptions: {
    pollIntervalMs: 1000,
    concurrency: 3,
  },
});

async function demonstrateMonitoring() {
  console.log('🚀 Starting Dren Monitoring Examples...');

  try {
    await dren.initialize();
    await dren.start();

    console.log('✅ Dren initialized and started');
    console.log('📊 Starting monitoring demonstrations...');

    // Example 1: Manual timing job
    console.log('\n📋 Example 1: Manual Execution Timing');
    const manualTimingJob = await dren.enqueue({
      name: 'manualTimingJob',
      payload: { data: 'test data for manual timing' },
      priority: 1,
    });
    console.log(`📦 Enqueued manual timing job: ${manualTimingJob}`);

    // Example 2: Automatic timing job
    console.log('\n📋 Example 2: Automatic Execution Timing');
    const automaticTimingJob = await dren.enqueue({
      name: 'automaticTimingJob',
      payload: { data: 'test data for automatic timing' },
      priority: 2,
    });
    console.log(`📦 Enqueued automatic timing job: ${automaticTimingJob}`);

    // Example 3: Monitored processor job
    console.log('\n📋 Example 3: Monitored Processor');
    const monitoredEmailJob = await dren.enqueue({
      name: 'monitoredEmailJob',
      payload: {
        recipient: 'user@example.com',
        subject: 'Test Email',
        body: 'This is a test email with monitoring',
      },
      priority: 1,
    });
    console.log(`📦 Enqueued monitored email job: ${monitoredEmailJob}`);

    // Example 4: Multiple jobs to show patterns
    console.log('\n📋 Example 4: Multiple Jobs for Pattern Analysis');
    const batchJobs = [];
    for (let i = 0; i < 5; i++) {
      batchJobs.push({
        name: 'monitoredEmailJob',
        payload: {
          recipient: `user${i}@example.com`,
          subject: `Batch Email ${i}`,
          body: `This is batch email ${i} with monitoring`,
        },
        priority: Math.floor(Math.random() * 3) + 1,
      });
    }

    await dren.enqueueBatch(batchJobs);
    console.log(`📦 Enqueued batch of ${batchJobs.length} monitored email jobs`);

    console.log('\n🔍 Monitoring Dashboard:');
    console.log('  📊 Open http://localhost:3001 to view the monitoring dashboard');
    console.log('  📈 Observe execution timing breakdowns for each job type');
    console.log('  ⏱️  Monitor method-level performance metrics');
    console.log('  🔄 Watch real-time job processing with detailed timing');

    console.log('\n📋 What to Observe in the Dashboard:');
    console.log('  • Manual Timing: Step-by-step execution breakdown');
    console.log('  • Automatic Timing: Wrapped method performance');
    console.log('  • Monitored Processor: Detailed processor timing');
    console.log('  • Batch Processing: Multiple jobs with timing patterns');
    console.log('  • Execution Time Distribution: Min/Max/Average/P95 times');
    console.log('  • Method Performance: Individual method execution times');

    console.log('\n🛑 Press Ctrl+C to stop the job queue');

    // Keep the process running
    process.stdin.resume();
  } catch (error) {
    console.error('❌ Failed to start monitoring examples:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down monitoring examples...');

  try {
    await dren.stop();
    await dren.disconnect();
    console.log('✅ Dren stopped and disconnected');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }

  process.exit(0);
});

// Start the demonstration
demonstrateMonitoring().catch(console.error);
