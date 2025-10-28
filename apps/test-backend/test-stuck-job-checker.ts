import { Dren, type JobProcessor } from 'dren';
import { drenConfig } from './src/config.js';
import { ObjectId } from 'mongodb';

/**
 * Test script to verify stuck job checker runs every 30 seconds
 */

// Test job processor that takes a long time (longer than maxRunningDurationMs)
const longRunningProcessor: JobProcessor<{ testId: string }> = async (payload, context) => {
  console.log(
    `🔄 Processing job ${context.jobId} (attempt ${context.attempt}) - Test ID: ${payload.testId}`
  );
  console.log(`⏳ This job will run for 45 seconds (longer than 30s maxRunningDurationMs)`);

  // Simulate a job that runs for 45 seconds (longer than maxRunningDurationMs)
  await new Promise(resolve => setTimeout(resolve, 45000));

  console.log(`✅ Job ${context.jobId} completed after 45 seconds`);
};

// Configure Dren for stuck job testing
drenConfig.jobConfigs.set('long-running-test', {
  name: 'long-running-test',
  processor: longRunningProcessor,
  maxRetries: 1,
  maxBackoffMs: 5000,
  priority: 1,
  maxRunningDurationMs: 30000, // 30 seconds max - job will exceed this
});

drenConfig.workerOptions = {
  pollIntervalMs: 2000,
  concurrency: 1, // Single worker for easier monitoring
  stuckJobTimeoutMs: 24 * 60 * 60 * 1000,
};

const dren = new Dren(drenConfig);

async function testStuckJobChecker() {
  console.log('🧪 Testing Stuck Job Checker');
  console.log('============================');

  try {
    // Initialize Dren
    await dren.initialize();
    console.log('✅ Dren initialized');

    // Start worker
    await dren.start();
    console.log('✅ Worker started with stuck job checker');

    // Add a job that will get stuck
    const jobId = await dren.enqueue({
      name: 'long-running-test',
      payload: { testId: 'stuck-job-test' },
      metadata: {
        source: 'stuck-job-test',
        expectedBehavior: 'should-be-reset-after-30-seconds',
        maxRunningDurationMs: 30000,
      },
    });

    console.log(`📝 Added job ${jobId} that will run for 45 seconds (exceeding 30s limit)`);
    console.log('⏰ Stuck job checker should reset this job after 30 seconds');
    console.log('👀 Watch for "⚠️ Reset X stuck jobs to pending" messages');

    // Monitor the job status
    let lastStatus = 'pending';
    let lastAttempts = 0;

    const monitorInterval = setInterval(async () => {
      try {
        const job = await dren.connection?.collection.findOne({ _id: new ObjectId(jobId) });

        if (job) {
          const newAttempts = job.attempts;
          const newStatus = job.status;

          if (newAttempts !== lastAttempts || newStatus !== lastStatus) {
            lastAttempts = newAttempts;
            lastStatus = newStatus;

            console.log(`📊 Job ${jobId}: attempts=${lastAttempts}, status=${lastStatus}`);

            if (lastStatus === 'failed') {
              clearInterval(monitorInterval);
              console.log('✅ Test completed - job was properly handled by stuck job checker');
              await dren.stop();
              await dren.disconnect();
              process.exit(0);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error monitoring job:', error);
      }
    }, 5000); // Check every 5 seconds

    // Timeout after 2 minutes
    setTimeout(() => {
      clearInterval(monitorInterval);
      console.log('⏰ Test timed out after 2 minutes');
      process.exit(1);
    }, 120000);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down...');
  await dren.stop();
  await dren.disconnect();
  process.exit(0);
});

// Run the test
testStuckJobChecker();
