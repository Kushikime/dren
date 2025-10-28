import { Dren } from 'dren';
import { drenConfig } from './src/config.js';

async function addTestJobs() {
  console.log('📝 Adding test jobs to the queue...');

  // Configure the same job type as the workers
  drenConfig.jobConfigs.set('test-job', {
    name: 'test-job',
    processor: async () => {}, // Dummy processor for enqueueing
    maxRetries: 3,
    maxBackoffMs: 5000,
    priority: 1,
    maxRunningDurationMs: 30000,
  });

  // Initialize Dren
  const dren = new Dren(drenConfig);
  await dren.initialize();

  // Add multiple jobs
  const jobs = [
    { name: 'test-job', payload: { message: 'Job 1' } },
    { name: 'test-job', payload: { message: 'Job 2' } },
    { name: 'test-job', payload: { message: 'Job 3' } },
    { name: 'test-job', payload: { message: 'Job 4' } },
    { name: 'test-job', payload: { message: 'Job 5' } },
    { name: 'test-job', payload: { message: 'Job 6' } },
  ];

  const jobIds = await dren.enqueueBatch(jobs);

  console.log(`✅ Added ${jobIds.length} jobs to the queue:`);
  jobIds.forEach((id, index) => {
    console.log(`  ${index + 1}. ${id} - ${jobs[index].payload.message}`);
  });

  await dren.disconnect();
  console.log('🔌 Disconnected from database');
}

addTestJobs().catch(error => {
  console.error('❌ Failed to add jobs:', error);
  process.exit(1);
});
