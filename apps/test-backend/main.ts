import { Dren, type JobProcessor } from 'dren';
import { drenConfig } from './src/config.js';

/**
 * Simple job processor for testing
 */
const testProcessor: JobProcessor<{ message: string }> = async (payload, context) => {
  console.log(
    `🔄 Processing job ${context.jobId} (attempt ${context.attempt}): ${payload.message}`
  );

  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log(`✅ Job ${context.jobId} completed successfully`);
};

/**
 * Initialize and start the always-running job processor with 5 concurrent workers
 */
async function startAlwaysRunningWorkers() {
  console.log('🚀 Starting always-running Dren job processor with 5 concurrent workers...');

  // Configure simple test job
  drenConfig.jobConfigs.set('test-job', {
    name: 'test-job',
    processor: testProcessor,
    maxRetries: 3,
    maxBackoffMs: 5000,
    priority: 1,
    maxRunningDurationMs: 30000, // 30 seconds max
  });

  // Configure worker with 5 concurrency
  drenConfig.workerOptions = {
    pollIntervalMs: 2000, // Poll every 2 seconds
    concurrency: 5, // 5 concurrent workers
    stuckJobTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
  };

  // Initialize Dren
  const dren = new Dren(drenConfig);
  await dren.initialize();

  console.log('✅ Dren initialized successfully');
  console.log('🔄 Starting 5 concurrent workers...');
  console.log('⏰ Stuck job checker will run every 30 seconds');
  console.log('📊 Workers will poll for jobs every 2 seconds');
  console.log('🛑 Press Ctrl+C to stop gracefully');

  // Start the worker
  await dren.start();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n🛑 Received SIGINT, shutting down gracefully...');
    await dren.stop();
    await dren.disconnect();
    console.log('✅ Shutdown complete');
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
    await dren.stop();
    await dren.disconnect();
    console.log('✅ Shutdown complete');
    process.exit(0);
  });

  // Keep the process alive
  setInterval(() => {
    // Just keep the process running
  }, 1000);
}

// Start the workers
startAlwaysRunningWorkers().catch(error => {
  console.error('❌ Failed to start workers:', error);
  process.exit(1);
});
