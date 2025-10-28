import { Dren, type JobProcessor } from 'dren';
import { drenConfig } from './src/config.js';

/**
 * Simple job processor that takes 2 seconds to complete
 */
const slowProcessor: JobProcessor<{ jobNumber: number }> = async (payload, context) => {
  console.log(
    `🔄 Processing job ${context.jobId} (attempt ${context.attempt}) - Job #${payload.jobNumber}`
  );

  // Simulate work that takes 2 seconds
  await new Promise(resolve => setTimeout(resolve, 2000));

  console.log(`✅ Job ${context.jobId} completed successfully`);
};

/**
 * Test the improved job runner logic
 */
async function testJobRunner() {
  console.log('🚀 Testing improved job runner logic...');

  // Configure job type
  drenConfig.jobConfigs.set('slow-job', {
    name: 'slow-job',
    processor: slowProcessor,
    maxRetries: 2,
    maxBackoffMs: 5000,
    priority: 1,
  });

  // Initialize Dren
  const dren = new Dren(drenConfig);
  await dren.initialize();

  console.log('📝 Creating 3 jobs...');
  const jobs = [
    { name: 'slow-job', payload: { jobNumber: 1 }, priority: 1 },
    { name: 'slow-job', payload: { jobNumber: 2 }, priority: 1 },
    { name: 'slow-job', payload: { jobNumber: 3 }, priority: 1 },
  ];

  const jobIds = await dren.enqueueBatch(jobs);
  console.log(`✅ Created ${jobIds.length} jobs: ${jobIds.join(', ')}`);

  console.log('\n🔄 Starting worker with improved logic...');
  console.log('📊 Expected behavior:');
  console.log('  - Polls for jobs when idle');
  console.log('  - Stops polling when job found');
  console.log('  - Resumes polling after job completes');
  console.log('  - Each job takes 2 seconds to complete');

  await dren.start();

  // Let it run for 15 seconds to see the behavior
  console.log('\n⏳ Running for 15 seconds...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  console.log('\n🛑 Stopping worker...');
  await dren.stop();
  await dren.disconnect();

  console.log('✅ Test completed!');
}

// Run the test
testJobRunner().catch(error => {
  console.error('❌ Test failed:', error);
  process.exit(1);
});
