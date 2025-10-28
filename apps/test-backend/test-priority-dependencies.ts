import { Dren, type JobProcessor, type DatabaseConnection } from 'dren';
import { drenConfig } from './src/config.js';
import { v4 as uuidv4 } from 'uuid';
import { ObjectId, type Db, type Collection, type Document } from 'mongodb';

// Extend global to include drenConnection
declare global {
  var drenConnection: DatabaseConnection | undefined;
}

/**
 * Results repository for storing job results
 */
class ResultsRepository {
  private collection: Collection;

  constructor(private db: Db) {
    this.collection = db.collection('results');
  }

  async createResult(data: Record<string, unknown>): Promise<string> {
    const result = {
      ...data,
      createdAt: new Date(),
    };

    const insertResult = await this.collection.insertOne(result);
    return insertResult.insertedId.toString();
  }

  async findByUuid(uuid: string): Promise<Document[]> {
    return await this.collection.find({ uuid }).toArray();
  }

  async getResult(id: string): Promise<Document | null> {
    return await this.collection.findOne({ _id: new ObjectId(id) });
  }
}

/**
 * Job A processor - creates record A with random number (10 second simulation)
 */
const jobAProcessor: JobProcessor<{ uuid: string }> = async (payload, context) => {
  console.log(
    `🅰️  Processing Job A ${context.jobId} (attempt ${context.attempt}) - UUID: ${payload.uuid}`
  );
  console.log(`⏳ Job A will take 10 seconds to complete...`);

  // Simulate 10 seconds of work
  await new Promise(resolve => setTimeout(resolve, 10000));

  const randomNumber = Math.floor(Math.random() * 100) + 1;

  const resultData = {
    uuid: payload.uuid,
    type: 'A',
    value: randomNumber,
    jobId: context.jobId,
    processedAt: new Date(),
  };

  if (!global.drenConnection) {
    throw new Error('Dren connection not available');
  }
  const resultsRepo = new ResultsRepository(global.drenConnection.db);
  const resultId = await resultsRepo.createResult(resultData);

  console.log(
    `✅ Job A completed: UUID ${payload.uuid}, Value: ${randomNumber}, Result ID: ${resultId}`
  );
};

/**
 * Job B processor - creates record B with random number (10 second simulation)
 */
const jobBProcessor: JobProcessor<{ uuid: string }> = async (payload, context) => {
  console.log(
    `🅱️  Processing Job B ${context.jobId} (attempt ${context.attempt}) - UUID: ${payload.uuid}`
  );
  console.log(`⏳ Job B will take 10 seconds to complete...`);

  // Simulate 10 seconds of work
  await new Promise(resolve => setTimeout(resolve, 10000));

  const randomNumber = Math.floor(Math.random() * 100) + 1;

  const resultData = {
    uuid: payload.uuid,
    type: 'B',
    value: randomNumber,
    jobId: context.jobId,
    processedAt: new Date(),
  };

  if (!global.drenConnection) {
    throw new Error('Dren connection not available');
  }
  const resultsRepo = new ResultsRepository(global.drenConnection.db);
  const resultId = await resultsRepo.createResult(resultData);

  console.log(
    `✅ Job B completed: UUID ${payload.uuid}, Value: ${randomNumber}, Result ID: ${resultId}`
  );
};

/**
 * Sum job processor - waits for A and B to complete, then calculates sum (10 second simulation)
 */
const sumProcessor: JobProcessor<{ uuid: string }> = async (payload, context) => {
  console.log(
    `➕ Processing Sum Job ${context.jobId} (attempt ${context.attempt}) - UUID: ${payload.uuid}`
  );
  console.log(`⏳ Sum job will take 10 seconds to complete...`);

  // Simulate 10 seconds of work
  await new Promise(resolve => setTimeout(resolve, 10000));

  if (!global.drenConnection) {
    throw new Error('Dren connection not available');
  }
  const resultsRepo = new ResultsRepository(global.drenConnection.db);

  // Find records A and B for this UUID
  const records = await resultsRepo.findByUuid(payload.uuid);
  const recordA = records.find(r => r.type === 'A');
  const recordB = records.find(r => r.type === 'B');

  if (!recordA || !recordB) {
    console.log(`⏳ Sum job waiting: UUID ${payload.uuid} - A: ${!!recordA}, B: ${!!recordB}`);
    throw new Error(`Dependencies not ready: A=${!!recordA}, B=${!!recordB}`);
  }

  const sum = recordA.value + recordB.value;

  const resultData = {
    uuid: payload.uuid,
    type: 'SUM',
    value: sum,
    recordA: recordA.value,
    recordB: recordB.value,
    jobId: context.jobId,
    processedAt: new Date(),
  };

  const resultId = await resultsRepo.createResult(resultData);

  console.log(
    `✅ Sum completed: UUID ${payload.uuid}, A=${recordA.value} + B=${recordB.value} = ${sum}, Result ID: ${resultId}`
  );
};

/**
 * Initialize Dren with priority-based job processors
 */
async function initializeDren() {
  console.log('🚀 Initializing Dren with priority-based job dependencies...');

  // Configure job types with strict priority ordering and max running duration
  drenConfig.jobConfigs.set('job-a', {
    name: 'job-a',
    processor: jobAProcessor,
    maxRetries: 3,
    maxBackoffMs: 10000,
    priority: 1, // Highest priority
    maxRunningDurationMs: 15000, // 15 seconds max (jobs take 10 seconds)
  });

  drenConfig.jobConfigs.set('job-b', {
    name: 'job-b',
    processor: jobBProcessor,
    maxRetries: 3,
    maxBackoffMs: 10000,
    priority: 1, // Same priority as job-a
    maxRunningDurationMs: 15000, // 15 seconds max (jobs take 10 seconds)
  });

  drenConfig.jobConfigs.set('sum', {
    name: 'sum',
    processor: sumProcessor,
    maxRetries: 5, // More retries for dependency waiting
    maxBackoffMs: 20000,
    priority: 2, // Lower priority - waits for priority 1 jobs
    maxRunningDurationMs: 15000, // 15 seconds max (jobs take 10 seconds)
  });

  // Configure worker with 5 concurrency
  drenConfig.workerOptions = {
    pollIntervalMs: 2000,
    concurrency: 5, // 5 concurrent workers
    stuckJobTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
  };

  // Initialize Dren
  const dren = new Dren(drenConfig);
  await dren.initialize();

  // Store connection globally for processor access
  if (dren.connection) {
    global.drenConnection = dren.connection;
  }

  return dren;
}

/**
 * Create priority-based job dependency scenario
 */
async function createPriorityJobs() {
  console.log('🎯 Creating priority-based job dependency scenario...');

  const dren = await initializeDren();

  // Generate UUID for this test scenario
  const testUuid = uuidv4();
  console.log(`📋 Test UUID: ${testUuid}`);

  // Create jobs with strict priority ordering
  const jobs = [
    // Priority 1 jobs (must complete first)
    {
      name: 'job-a',
      payload: { uuid: testUuid },
      priority: 1,
    },
    {
      name: 'job-b',
      payload: { uuid: testUuid },
      priority: 1,
    },
    // Priority 2 job (waits for priority 1 to complete)
    {
      name: 'sum',
      payload: { uuid: testUuid },
      priority: 2,
    },
  ];

  const jobIds = await dren.enqueueBatch(jobs);

  console.log(`✅ Created ${jobIds.length} jobs with strict priority ordering:`);
  jobs.forEach((job, index) => {
    console.log(`  ${index + 1}. ${jobIds[index]} - ${job.name} (Priority ${job.priority})`);
  });

  return { dren, jobIds, testUuid };
}

/**
 * Monitor job processing with priority verification
 */
async function monitorPriorityProcessing(dren: Dren, testUuid: string) {
  console.log('\n🔄 Starting priority-based job processing with concurrency...');
  console.log('📊 Expected behavior:');
  console.log('  - 5 concurrent workers available');
  console.log('  - Priority 1 jobs (A, B) must complete first (10 seconds each)');
  console.log('  - Priority 2 job (Sum) waits for A and B');
  console.log('  - Sum job will retry until dependencies are ready');
  console.log('  - Total expected time: ~20 seconds (A: 10s + B: 10s concurrent, then Sum: 10s)');
  console.log('  - Should see both A and B processing simultaneously');

  await dren.start();

  // Monitor progress
  const checkInterval = 3000; // Check every 3 seconds

  const monitor = setInterval(async () => {
    if (!global.drenConnection) return;

    const db = global.drenConnection.db;
    const resultsRepo = new ResultsRepository(db);

    // Check job status
    const stats = await db
      .collection('job-queue')
      .aggregate([
        {
          $group: {
            _id: '$status',
            count: { $sum: 1 },
          },
        },
      ])
      .toArray();

    // Check results for our test UUID
    const results = await resultsRepo.findByUuid(testUuid);

    console.log(
      '\n📊 Job Status:',
      stats.reduce((acc, stat) => {
        acc[stat._id] = stat.count;
        return acc;
      }, {})
    );

    if (results.length > 0) {
      console.log(`🎯 Results for UUID ${testUuid}:`);
      results.forEach(result => {
        console.log(`  ${result.type}: ${result.value} (Job: ${result.jobId})`);
      });
    }

    // Check if sum job is complete
    const sumResult = results.find(r => r.type === 'SUM');
    if (sumResult) {
      console.log(`\n🎉 Priority test completed successfully!`);
      console.log(`   Final sum: ${sumResult.recordA} + ${sumResult.recordB} = ${sumResult.value}`);
      clearInterval(monitor);
      await dren.stop();
      await dren.disconnect();
      console.log('✅ Priority-based job processing completed!');
    }
  }, checkInterval);

  // Let it run for up to 60 seconds
  setTimeout(async () => {
    clearInterval(monitor);
    await dren.stop();
    await dren.disconnect();
    console.log('\n⏰ Monitoring timeout reached');
  }, 60000);
}

/**
 * Main execution
 */
async function main() {
  try {
    const { dren, testUuid } = await createPriorityJobs();
    await monitorPriorityProcessing(dren, testUuid);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
