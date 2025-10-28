import { Dren, type JobProcessor } from 'dren';
import { drenConfig } from './src/config.js';
import { ObjectId } from 'mongodb';

/**
 * Comprehensive stress tests for Dren job queue system
 * Tests priority queues, retries, concurrency, and metadata support
 */

// Test job processor that can simulate different scenarios
const stressTestProcessor: JobProcessor<{
  testType: string;
  shouldFail: boolean;
  failAfterAttempts?: number;
  processingTimeMs?: number;
  testId: string;
}> = async (payload, context) => {
  const { testType, shouldFail, failAfterAttempts, processingTimeMs = 1000, testId } = payload;

  console.log(
    `🧪 [${testType}] Processing job ${context.jobId} (attempt ${context.attempt}) - Test ID: ${testId}`
  );

  // Simulate processing time
  if (processingTimeMs > 0) {
    await new Promise(resolve => setTimeout(resolve, processingTimeMs));
  }

  // Simulate failure scenarios
  if (shouldFail) {
    if (failAfterAttempts && context.attempt >= failAfterAttempts) {
      // Fail after specific number of attempts
      throw new Error(
        `[${testType}] Intentional failure after ${context.attempt} attempts - Test ID: ${testId}`
      );
    } else if (!failAfterAttempts) {
      // Always fail
      throw new Error(`[${testType}] Intentional failure - Test ID: ${testId}`);
    }
  }

  // Success case
  console.log(`✅ [${testType}] Job ${context.jobId} completed successfully - Test ID: ${testId}`);

  // Store result in results collection
  const resultsCollection = (global as any).drenConnection?.db.collection('results');
  if (resultsCollection) {
    const resultRecord = {
      testType,
      testId,
      jobId: new ObjectId(context.jobId),
      attempt: context.attempt,
      completedAt: new Date(),
      metadata: context.jobType, // Store job type as metadata
    };
    await resultsCollection.insertOne(resultRecord);
  }
};

// Configure Dren for stress testing
drenConfig.jobConfigs.set('stress-test', {
  name: 'stress-test',
  processor: stressTestProcessor,
  maxRetries: 3,
  maxBackoffMs: 5000,
  priority: 1,
  maxRunningDurationMs: 30000, // 30 seconds max
});

drenConfig.workerOptions = {
  pollIntervalMs: 1000, // Poll every second
  concurrency: 5, // 5 concurrent workers
  stuckJobTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
};

const dren = new Dren(drenConfig);

/**
 * Test Case 1: Mixed Priority Flood
 * Enqueue 50 jobs with mixed priorities (1-5)
 */
async function testMixedPriorityFlood() {
  console.log('\n🧪 Test Case 1: Mixed Priority Flood');
  console.log('📊 Adding 50 jobs with priorities 1-5...');

  const jobs = [];
  for (let i = 0; i < 50; i++) {
    const priority = Math.floor(Math.random() * 5) + 1;
    jobs.push({
      name: 'stress-test',
      payload: {
        testType: 'priority-flood',
        shouldFail: false,
        testId: `priority-${priority}-${i}`,
        processingTimeMs: 500, // Quick processing
      },
      priority,
      metadata: {
        source: 'stress-test',
        testCase: 'mixed-priority-flood',
        priority,
        jobNumber: i,
        timestamp: new Date().toISOString(),
      },
    });
  }

  const jobIds = await dren.enqueueBatch(jobs);
  console.log(`✅ Added ${jobIds.length} jobs with mixed priorities`);

  // Monitor completion
  await monitorJobCompletion('priority-flood', 50);
}

/**
 * Test Case 2: Retry Logic Stress Test
 * Create jobs that fail and retry multiple times
 */
async function testRetryLogic() {
  console.log('\n🧪 Test Case 2: Retry Logic Stress Test');
  console.log('📊 Adding jobs with different retry scenarios...');

  const retryJobs = [
    // Job that always fails (should be marked as failed after 3 retries)
    {
      name: 'stress-test',
      payload: {
        testType: 'retry-always-fail',
        shouldFail: true,
        testId: 'always-fail-1',
        processingTimeMs: 200,
      },
      metadata: {
        source: 'stress-test',
        testCase: 'retry-logic',
        scenario: 'always-fail',
        expectedOutcome: 'failed',
      },
    },
    // Job that fails first 2 attempts then succeeds
    {
      name: 'stress-test',
      payload: {
        testType: 'retry-then-succeed',
        shouldFail: true,
        failAfterAttempts: 2,
        testId: 'retry-then-succeed-1',
        processingTimeMs: 300,
      },
      metadata: {
        source: 'stress-test',
        testCase: 'retry-logic',
        scenario: 'retry-then-succeed',
        expectedOutcome: 'succeeded',
      },
    },
    // Job that succeeds immediately
    {
      name: 'stress-test',
      payload: {
        testType: 'retry-immediate-success',
        shouldFail: false,
        testId: 'immediate-success-1',
        processingTimeMs: 100,
      },
      metadata: {
        source: 'stress-test',
        testCase: 'retry-logic',
        scenario: 'immediate-success',
        expectedOutcome: 'succeeded',
      },
    },
  ];

  const jobIds = await dren.enqueueBatch(retryJobs);
  console.log(`✅ Added ${jobIds.length} retry test jobs`);

  // Monitor completion
  await monitorJobCompletion('retry-logic', 3);
}

/**
 * Test Case 3: Concurrency Stress Test
 * Add many jobs with same priority to test concurrent processing
 */
async function testConcurrency() {
  console.log('\n🧪 Test Case 3: Concurrency Stress Test');
  console.log('📊 Adding 20 jobs with same priority for concurrent processing...');

  const concurrencyJobs = [];
  for (let i = 0; i < 20; i++) {
    concurrencyJobs.push({
      name: 'stress-test',
      payload: {
        testType: 'concurrency-test',
        shouldFail: false,
        testId: `concurrent-${i}`,
        processingTimeMs: 2000, // 2 seconds each
      },
      priority: 1, // Same priority for all
      metadata: {
        source: 'stress-test',
        testCase: 'concurrency',
        batchNumber: i,
        expectedConcurrency: 5,
      },
    });
  }

  const startTime = Date.now();
  const jobIds = await dren.enqueueBatch(concurrencyJobs);
  console.log(`✅ Added ${jobIds.length} concurrent jobs`);

  // Monitor completion
  await monitorJobCompletion('concurrency-test', 20);

  const endTime = Date.now();
  const totalTime = endTime - startTime;
  console.log(`⏱️  Total processing time: ${totalTime}ms`);
  console.log(`📊 Expected time with 5 workers: ~8 seconds (20 jobs × 2s ÷ 5 workers)`);
}

/**
 * Test Case 4: Priority Starvation Prevention
 * Continuously add high priority jobs while low priority jobs wait
 */
async function testPriorityStarvation() {
  console.log('\n🧪 Test Case 4: Priority Starvation Prevention');
  console.log('📊 Adding low priority jobs first, then high priority jobs...');

  // Add 5 low priority jobs
  const lowPriorityJobs = [];
  for (let i = 0; i < 5; i++) {
    lowPriorityJobs.push({
      name: 'stress-test',
      payload: {
        testType: 'starvation-low-priority',
        shouldFail: false,
        testId: `low-priority-${i}`,
        processingTimeMs: 3000, // 3 seconds each
      },
      priority: 5, // Low priority
      metadata: {
        source: 'stress-test',
        testCase: 'priority-starvation',
        priority: 5,
        expectedBehavior: 'should-be-delayed-by-higher-priority',
      },
    });
  }

  await dren.enqueueBatch(lowPriorityJobs);
  console.log('✅ Added 5 low priority jobs (priority 5)');

  // Wait a bit, then add high priority jobs
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Add 3 high priority jobs
  const highPriorityJobs = [];
  for (let i = 0; i < 3; i++) {
    highPriorityJobs.push({
      name: 'stress-test',
      payload: {
        testType: 'starvation-high-priority',
        shouldFail: false,
        testId: `high-priority-${i}`,
        processingTimeMs: 1000, // 1 second each
      },
      priority: 1, // High priority
      metadata: {
        source: 'stress-test',
        testCase: 'priority-starvation',
        priority: 1,
        expectedBehavior: 'should-process-before-low-priority',
      },
    });
  }

  await dren.enqueueBatch(highPriorityJobs);
  console.log('✅ Added 3 high priority jobs (priority 1)');

  // Monitor completion
  await monitorJobCompletion('priority-starvation', 8);
}

/**
 * Test Case 5: Metadata Tracking
 * Test that metadata is properly stored and accessible
 */
async function testMetadataTracking() {
  console.log('\n🧪 Test Case 5: Metadata Tracking');
  console.log('📊 Adding jobs with rich metadata...');

  const metadataJobs = [
    {
      name: 'stress-test',
      payload: {
        testType: 'metadata-test',
        shouldFail: false,
        testId: 'metadata-1',
        processingTimeMs: 500,
      },
      metadata: {
        source: 'kafka',
        topic: 'user-events',
        partition: 0,
        offset: 12345,
        headers: {
          'content-type': 'application/json',
          'user-id': 'user-123',
          'session-id': 'session-456',
          'request-id': 'req-789',
        },
        producer: {
          service: 'user-service',
          version: '1.2.3',
          environment: 'production',
        },
        timestamp: new Date().toISOString(),
      },
    },
    {
      name: 'stress-test',
      payload: {
        testType: 'metadata-test',
        shouldFail: false,
        testId: 'metadata-2',
        processingTimeMs: 500,
      },
      metadata: {
        source: 'api',
        endpoint: '/api/users/create',
        method: 'POST',
        userAgent: 'Mozilla/5.0...',
        ip: '192.168.1.100',
        requestId: 'req-abc-123',
        userId: 'user-456',
      },
    },
  ];

  const jobIds = await dren.enqueueBatch(metadataJobs);
  console.log(`✅ Added ${jobIds.length} jobs with metadata`);

  // Monitor completion
  await monitorJobCompletion('metadata-test', 2);

  // Verify metadata was stored
  await verifyMetadataStored(jobIds);
}

/**
 * Monitor job completion for a specific test type
 */
async function monitorJobCompletion(testType: string, expectedCount: number) {
  console.log(`⏳ Monitoring completion of ${expectedCount} ${testType} jobs...`);

  const startTime = Date.now();
  let completedCount = 0;
  let failedCount = 0;

  const checkInterval = setInterval(async () => {
    try {
      const resultsCollection = (global as any).drenConnection?.db.collection('results');
      if (resultsCollection) {
        const completed = await resultsCollection.countDocuments({ testType });
        const failed =
          (await (global as any).drenConnection?.collection.countDocuments({
            status: 'failed',
            'payload.testType': testType,
          })) || 0;

        completedCount = completed;
        failedCount = failed;

        const totalProcessed = completedCount + failedCount;
        console.log(
          `📊 ${testType}: ${totalProcessed}/${expectedCount} processed (${completedCount} succeeded, ${failedCount} failed)`
        );

        if (totalProcessed >= expectedCount) {
          clearInterval(checkInterval);
          const endTime = Date.now();
          console.log(`✅ ${testType} test completed in ${endTime - startTime}ms`);
          console.log(`📊 Final results: ${completedCount} succeeded, ${failedCount} failed`);
        }
      }
    } catch (error) {
      console.error(`❌ Error monitoring ${testType}:`, error);
    }
  }, 2000);

  // Timeout after 5 minutes
  setTimeout(() => {
    clearInterval(checkInterval);
    console.log(`⏰ ${testType} test timed out after 5 minutes`);
  }, 300000);
}

/**
 * Verify that metadata was properly stored in job documents
 */
async function verifyMetadataStored(jobIds: string[]) {
  console.log('🔍 Verifying metadata storage...');

  try {
    for (const jobId of jobIds) {
      const job = await (global as any).drenConnection?.collection.findOne({
        _id: new ObjectId(jobId),
      });

      if (job && job.metadata) {
        console.log(`✅ Job ${jobId} has metadata:`, JSON.stringify(job.metadata, null, 2));
      } else {
        console.log(`❌ Job ${jobId} missing metadata`);
      }
    }
  } catch (error) {
    console.error('❌ Error verifying metadata:', error);
  }
}

/**
 * Run all stress tests
 */
async function runStressTests() {
  console.log('🚀 Starting Dren Job Queue Stress Tests');
  console.log('=====================================');

  try {
    // Initialize Dren
    await dren.initialize();
    console.log('✅ Dren initialized successfully');

    // Store connection globally for monitoring
    (global as any).drenConnection = dren.connection;

    // Start workers
    await dren.start();
    console.log('✅ Workers started');

    // Run tests sequentially
    await testMixedPriorityFlood();
    await new Promise(resolve => setTimeout(resolve, 5000)); // Wait between tests

    await testRetryLogic();
    await new Promise(resolve => setTimeout(resolve, 5000));

    await testConcurrency();
    await new Promise(resolve => setTimeout(resolve, 5000));

    await testPriorityStarvation();
    await new Promise(resolve => setTimeout(resolve, 5000));

    await testMetadataTracking();

    console.log('\n🎉 All stress tests completed!');
    console.log('📊 Check the results collection for detailed results');
  } catch (error) {
    console.error('❌ Stress test failed:', error);
  } finally {
    // Keep workers running for a bit to process remaining jobs
    console.log('⏳ Waiting 30 seconds for remaining jobs to complete...');
    await new Promise(resolve => setTimeout(resolve, 30000));

    await dren.stop();
    await dren.disconnect();
    console.log('🔌 Disconnected from database');
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Received SIGINT, shutting down gracefully...');
  await dren.stop();
  await dren.disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down gracefully...');
  await dren.stop();
  await dren.disconnect();
  process.exit(0);
});

// Run the stress tests
runStressTests().catch(error => {
  console.error('❌ Failed to run stress tests:', error);
  process.exit(1);
});
