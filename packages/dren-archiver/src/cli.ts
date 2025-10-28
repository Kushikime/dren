#!/usr/bin/env node

import { JobArchiver } from './archiver.js';
import type { ArchiverConfig } from './types.js';

const config: ArchiverConfig = {
  database: {
    type: 'mongodb',
    url: process.env.MONGO_URL || 'mongodb://localhost:27017',
    dbName: process.env.DB_NAME || 'dren',
    mainCollectionName: process.env.MAIN_COLLECTION || 'job-queue',
    archiveCollectionPrefix: process.env.ARCHIVE_PREFIX || 'job-archive',
  },
  schedule: {
    cronExpression: process.env.CRON_EXPRESSION || '0 2 * * *', // 2 AM daily
    timezone: process.env.TIMEZONE || 'UTC',
  },
  retention: {
    archiveAfterDays: parseInt(process.env.ARCHIVE_AFTER_DAYS || '1'),
    deleteAfterDays: parseInt(process.env.DELETE_AFTER_DAYS || '90'),
  },
  batchSize: parseInt(process.env.BATCH_SIZE || '1000'),
};

const archiver = new JobArchiver(config);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down job archiver...');
  await archiver.stop();
  await archiver.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down job archiver...');
  await archiver.stop();
  await archiver.disconnect();
  process.exit(0);
});

// Handle command line arguments
const args = process.argv.slice(2);
const command = args[0];

async function main() {
  await archiver.connect();

  switch (command) {
    case 'run': {
      console.log('🔄 Running archiving process manually...');
      await archiver.runArchiving();
      break;
    }

    case 'status': {
      const status = await archiver.getStatus();
      console.log('📊 Archiver Status:');
      console.log(`  Running: ${status.isRunning}`);
      console.log(`  Last Run: ${status.lastRun?.toISOString() || 'Never'}`);
      console.log(`  Next Run: ${status.nextRun?.toISOString() || 'Not scheduled'}`);
      console.log(`  Total Jobs Archived: ${status.totalJobsArchived}`);
      console.log(`  Total Jobs Deleted: ${status.totalJobsDeleted}`);
      console.log(`  Archive Collections: ${status.archiveCollections.length}`);

      if (status.archiveCollections.length > 0) {
        console.log('\n📦 Archive Collections:');
        status.archiveCollections.forEach(col => {
          console.log(`  ${col.collectionName}: ${col.jobCount} jobs (${col.shardKey})`);
        });
      }

      if (status.errors.length > 0) {
        console.log('\n❌ Recent Errors:');
        status.errors.slice(-5).forEach(error => console.log(`  ${error}`));
      }
      break;
    }

    case 'query': {
      const startDate = args[1];
      const endDate = args[2];
      const jobName = args[3];

      if (!startDate || !endDate) {
        console.error('Usage: dren-archiver query <startDate> <endDate> [jobName]');
        console.error('Date format: YYYY-MM-DD');
        process.exit(1);
      }

      console.log(
        `🔍 Querying archived jobs from ${startDate} to ${endDate}${jobName ? ` for job: ${jobName}` : ''}`
      );
      const jobs = await archiver.getArchivedJobs(startDate, endDate, jobName);
      console.log(`Found ${jobs.length} archived jobs`);

      if (jobs.length > 0) {
        console.log('\nSample jobs:');
        jobs.slice(0, 5).forEach(job => {
          console.log(`  ${job.name} - ${job.shardKey} - ${job.archivedAt.toISOString()}`);
        });
      }
      break;
    }

    case 'start':
    default: {
      console.log('🚀 Starting job archiver service...');
      await archiver.start();

      // Keep the process running
      process.stdin.resume();
      break;
    }
  }
}

main().catch((error: Error) => {
  console.error('❌ Failed to start job archiver:', error);
  process.exit(1);
});
