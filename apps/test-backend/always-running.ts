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
  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`✅ Job ${context.jobId} completed successfully`);
};

/**
 * Initialize and start the always-running job processor
 */
async function startAlwaysRunningProcessor() {
  console.log('🚀 Starting always-running Dren job processor...');

  // Configure simple test job
  drenConfig.jobConfigs.set('test-job', {
    name: 'test-job',
    processor: testProcessor,
    maxRetries: 3,
    maxBackoffMs: 5000,
    priority: 1,
  });

  // Initialize Dren
  const dren = new Dren(drenConfig);
  await dren.initialize();

  console.log('✅ Dren initialized successfully');

  // Start the worker
  await dren.start();

  console.log('🔄 Job processor is now running and will poll for jobs...');
  console.log('📊 Use the spawn-jobs script to create test jobs');
  console.log('🛑 Press Ctrl+C to stop gracefully');

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

// Start the processor
startAlwaysRunningProcessor().catch(error => {
  console.error('❌ Failed to start processor:', error);
  process.exit(1);
});
