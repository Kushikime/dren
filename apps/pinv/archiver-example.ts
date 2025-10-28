import { Dren } from 'dren';
import { JobArchiver } from '@dren/archiver';
import { jobConfigs } from './job-configs';

async function main() {
  console.log('🚀 Starting Dren with Job Archiver...');

  // Initialize Dren job queue
  const dren = new Dren({
    database: {
      type: 'mongodb',
      url: process.env.MONGO_URL!,
      dbName: process.env.DB_NAME!,
    },
    jobConfigs,
    workerOptions: {
      pollIntervalMs: 1000,
      concurrency: 2,
    },
  });

  // Initialize Job Archiver
  const archiver = new JobArchiver({
    database: {
      type: 'mongodb',
      url: process.env.MONGO_URL!,
      dbName: process.env.DB_NAME!,
      mainCollectionName: 'job-queue',
      archiveCollectionPrefix: 'job-archive',
    },
    schedule: {
      cronExpression: '0 2 * * *', // 2 AM daily
      timezone: 'UTC',
    },
    retention: {
      archiveAfterDays: 1, // Archive jobs older than 1 day
      deleteAfterDays: 90, // Keep archives for 90 days
    },
    batchSize: 1000,
  });

  try {
    // Start both services
    await dren.initialize();
    await dren.start();
    console.log('✅ Dren job queue started');

    await archiver.connect();
    await archiver.start();
    console.log('✅ Job archiver started');

    // Enqueue some test jobs
    console.log('📦 Enqueueing test jobs...');

    for (let i = 0; i < 5; i++) {
      await dren.enqueue({
        name: 'tmf637PostJob',
        payload: { data: `Test job ${i}` },
      });
    }

    for (let i = 0; i < 3; i++) {
      await dren.enqueue({
        name: 'tmf637PatchJob',
        payload: { data: `Patch job ${i}` },
      });
    }

    console.log('📊 Jobs enqueued successfully');

    // Show archiver status
    const status = await archiver.getStatus();
    console.log('\n📈 Archiver Status:');
    console.log(`  Running: ${status.isRunning}`);
    console.log(`  Next Run: ${status.nextRun?.toISOString()}`);
    console.log(`  Archive Collections: ${status.archiveCollections.length}`);

    // Keep the process running
    console.log('\n🔄 Services running... Press Ctrl+C to stop');
    process.stdin.resume();
  } catch (error) {
    console.error('❌ Failed to start services:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down services...');

  try {
    // Stop archiver
    const archiver = new JobArchiver({
      database: {
        type: 'mongodb',
        url: process.env.MONGO_URL!,
        dbName: process.env.DB_NAME!,
      },
    });
    await archiver.connect();
    await archiver.stop();
    await archiver.disconnect();
    console.log('✅ Archiver stopped');
  } catch (error) {
    console.error('❌ Error stopping archiver:', error);
  }

  process.exit(0);
});

main().catch(console.error);
