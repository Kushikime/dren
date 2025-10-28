import { Dren, type JobProcessor } from 'dren';
import { drenConfig } from './src/config.js';
import { ObjectId } from 'mongodb';

/**
 * Test script to verify retry logic bug fix
 * This test ensures that jobs are marked as failed when attempts > maxRetries
 */

// Test job processor that always fails
const alwaysFailProcessor: JobProcessor<{ testId: string }> = async (payload, context) => {
  console.log(
    `🔄 Processing job ${context.jobId} (attempt ${context.attempt}) - Test ID: ${payload.testId}`
  );

  // Always fail
  throw new Error(`Intentional failure for test ${payload.testId} on attempt ${context.attempt}`);
};

// Configure Dren for retry testing
drenConfig.jobConfigs.set('retry-test', {
  name: 'retry-test',
  processor: alwaysFailProcessor,
  maxRetries: 2, // Should fail after 3 attempts (0, 1, 2)
  maxBackoffMs: 2000, // Quick backoff for testing
  priority: 1,
  maxRunningDurationMs: 10000, // 10 seconds max
});

drenConfig.workerOptions = {
  pollIntervalMs: 1000,
  concurrency: 1, // Single worker for easier monitoring
  stuckJobTimeoutMs: 24 * 60 * 60 * 1000,
};

const dren = new Dren(drenConfig);

async function testRetryBugFix() {
  console.log('🧪 Testing Retry Logic Bug Fix');
  console.log('================================');

  try {
    // Initialize Dren
    await dren.initialize();
    console.log('✅ Dren initialized');

    // Start worker
    await dren.start();
    console.log('✅ Worker started');

    // Add a job that will fail
    const jobId = await dren.enqueue({
      name: 'retry-test',
      payload: { testId: 'retry-bug-test' },
      metadata: {
        source: 'retry-bug-test',
        expectedBehavior: 'should-fail-after-3-attempts',
        maxRetries: 2,
      },
    });

    console.log(`📝 Added job ${jobId} that should fail after 3 attempts`);

    // Monitor the job status
    let attempts = 0;
    let status = 'pending';

    const monitorInterval = setInterval(async () => {
      try {
        const job = await dren.connection?.collection.findOne({ _id: new ObjectId(jobId) });

        if (job) {
          const newAttempts = job.attempts;
          const newStatus = job.status;

          if (newAttempts !== attempts || newStatus !== status) {
            attempts = newAttempts;
            status = newStatus;

            console.log(`📊 Job ${jobId}: attempts=${attempts}, status=${status}`);

            if (status === 'failed') {
              clearInterval(monitorInterval);

              // Verify the bug is fixed
              if (attempts === 3) {
                // 0, 1, 2 attempts = 3 total attempts
                console.log(
                  '✅ BUG FIXED: Job correctly failed after 3 attempts (attempts <= maxRetries)'
                );
                console.log(
                  `📊 Final status: ${status}, Final attempts: ${attempts}, Max retries: 2`
                );
              } else {
                console.log(
                  `❌ BUG STILL EXISTS: Job failed after ${attempts} attempts, expected 3`
                );
              }

              // Show error history
              console.log('📋 Error history:');
              job.errors.forEach((error: { attempt: number; error: string }, index: number) => {
                console.log(`  ${index + 1}. Attempt ${error.attempt}: ${error.error}`);
              });

              await dren.stop();
              await dren.disconnect();
              process.exit(0);
            }
          }
        }
      } catch (error) {
        console.error('❌ Error monitoring job:', error);
      }
    }, 1000);

    // Timeout after 30 seconds
    setTimeout(() => {
      clearInterval(monitorInterval);
      console.log('⏰ Test timed out after 30 seconds');
      process.exit(1);
    }, 30000);
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
testRetryBugFix();
