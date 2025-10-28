import { Dren } from 'dren';
import { createMonitoredProcessor } from '@dren/monitoring';
import { jobConfigs } from './job-configs';

// Test job types
enum TestJobType {
  DataProcessing = 'dataProcessing',
  EmailSending = 'emailSending',
  FileUpload = 'fileUpload',
  ReportGeneration = 'reportGeneration',
  DataValidation = 'dataValidation',
}

// Job payloads
interface DataProcessingPayload {
  datasetSize: number;
  operation: 'sum' | 'average' | 'max' | 'min';
}

interface EmailSendingPayload {
  recipientCount: number;
  templateId: string;
  priority: 'high' | 'normal' | 'low';
}

interface FileUploadPayload {
  fileName: string;
  fileSize: number;
  uploadType: 'image' | 'document' | 'video';
}

interface ReportGenerationPayload {
  reportType: string;
  dateRange: { start: string; end: string };
  format: 'pdf' | 'excel' | 'csv';
}

interface DataValidationPayload {
  dataSource: string;
  validationRules: string[];
  strictMode: boolean;
}

// Create processors with random execution times (1-25 seconds)
const createRandomProcessor = <T>(jobName: string, minSeconds = 1, maxSeconds = 25) => {
  return createMonitoredProcessor(async (payload: T) => {
    // Generate random execution time between min and max seconds
    const executionTimeSeconds =
      Math.floor(Math.random() * (maxSeconds - minSeconds + 1)) + minSeconds;

    console.log(`🔄 Processing ${jobName} - Estimated time: ${executionTimeSeconds}s`);

    // Simulate work with random execution time
    await new Promise(resolve => setTimeout(resolve, executionTimeSeconds * 1000));

    // Simulate occasional failures (5% failure rate)
    if (Math.random() < 0.05) {
      throw new Error(`Simulated failure in ${jobName} after ${executionTimeSeconds}s`);
    }

    // Return realistic results
    const result = {
      processedAt: new Date(),
      executionTimeSeconds,
      jobName,
      payload,
      status: 'completed',
      metadata: {
        processor: jobName,
        version: '1.0.0',
        executionTime: executionTimeSeconds,
      },
    };

    console.log(`✅ Completed ${jobName} in ${executionTimeSeconds}s`);
    return result;
  }, jobName);
};

// Register test job configurations
const testJobConfigs = new Map([
  [
    TestJobType.DataProcessing,
    {
      name: TestJobType.DataProcessing,
      processor: createRandomProcessor<DataProcessingPayload>(TestJobType.DataProcessing, 2, 15),
      maxRetries: 3,
      maxBackoffMs: 5000,
      priority: 1,
    },
  ],

  [
    TestJobType.EmailSending,
    {
      name: TestJobType.EmailSending,
      processor: createRandomProcessor<EmailSendingPayload>(TestJobType.EmailSending, 1, 8),
      maxRetries: 2,
      maxBackoffMs: 3000,
      priority: 2,
    },
  ],

  [
    TestJobType.FileUpload,
    {
      name: TestJobType.FileUpload,
      processor: createRandomProcessor<FileUploadPayload>(TestJobType.FileUpload, 3, 25),
      maxRetries: 5,
      maxBackoffMs: 10000,
      priority: 1,
    },
  ],

  [
    TestJobType.ReportGeneration,
    {
      name: TestJobType.ReportGeneration,
      processor: createRandomProcessor<ReportGenerationPayload>(
        TestJobType.ReportGeneration,
        5,
        20
      ),
      maxRetries: 2,
      maxBackoffMs: 8000,
      priority: 3,
    },
  ],

  [
    TestJobType.DataValidation,
    {
      name: TestJobType.DataValidation,
      processor: createRandomProcessor<DataValidationPayload>(TestJobType.DataValidation, 1, 12),
      maxRetries: 4,
      maxBackoffMs: 4000,
      priority: 2,
    },
  ],
]);

// Merge with existing job configs
const allJobConfigs = new Map<string, unknown>([...jobConfigs, ...testJobConfigs]);

// Initialize Dren with test configuration
const dren = new Dren({
  database: {
    type: 'mongodb',
    url:
      process.env.MONGO_URL ||
      'mongodb://dren_user:dren_password@localhost:27018/dren_test?authSource=dren_test',
    dbName: process.env.DB_NAME || 'dren_test',
  },
  jobConfigs: allJobConfigs,
  workerOptions: {
    pollIntervalMs: 500, // Faster polling for testing
    concurrency: 10, // Higher concurrency for testing
    stuckJobTimeoutMs: 30000, // 30 seconds timeout
  },
});

// Generate random payloads
function generateRandomPayload(jobType: TestJobType): unknown {
  switch (jobType) {
    case TestJobType.DataProcessing:
      return {
        datasetSize: Math.floor(Math.random() * 10000) + 100,
        operation: ['sum', 'average', 'max', 'min'][Math.floor(Math.random() * 4)],
      };

    case TestJobType.EmailSending:
      return {
        recipientCount: Math.floor(Math.random() * 1000) + 1,
        templateId: `template_${Math.floor(Math.random() * 100)}`,
        priority: ['high', 'normal', 'low'][Math.floor(Math.random() * 3)],
      };

    case TestJobType.FileUpload:
      return {
        fileName: `file_${Math.floor(Math.random() * 1000)}.${['jpg', 'pdf', 'mp4', 'docx'][Math.floor(Math.random() * 4)]}`,
        fileSize: Math.floor(Math.random() * 100000000) + 1000000, // 1MB to 100MB
        uploadType: ['image', 'document', 'video'][Math.floor(Math.random() * 3)],
      };

    case TestJobType.ReportGeneration:
      return {
        reportType: ['sales', 'inventory', 'financial', 'user'][Math.floor(Math.random() * 4)],
        dateRange: {
          start: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000)
            .toISOString()
            .split('T')[0],
          end: new Date().toISOString().split('T')[0],
        },
        format: ['pdf', 'excel', 'csv'][Math.floor(Math.random() * 3)],
      };

    case TestJobType.DataValidation:
      return {
        dataSource: `source_${Math.floor(Math.random() * 50)}`,
        validationRules: ['required', 'format', 'range', 'uniqueness'].slice(
          0,
          Math.floor(Math.random() * 4) + 1
        ),
        strictMode: Math.random() < 0.5,
      };

    default:
      return {};
  }
}

async function populateTestJobs() {
  console.log('🚀 Starting Dren test job population...');

  try {
    await dren.initialize();
    await dren.start();

    console.log('✅ Dren initialized and started');
    console.log('📦 Starting to populate 1000 test jobs...');

    const jobTypes = Object.values(TestJobType);
    const jobsToCreate = 1000;
    const batchSize = 50; // Process in batches

    let createdJobs = 0;

    for (let i = 0; i < jobsToCreate; i += batchSize) {
      const batchJobs = [];
      const currentBatchSize = Math.min(batchSize, jobsToCreate - i);

      for (let j = 0; j < currentBatchSize; j++) {
        const jobType = jobTypes[Math.floor(Math.random() * jobTypes.length)];
        const payload = generateRandomPayload(jobType);

        batchJobs.push({
          name: jobType,
          payload,
          priority: Math.floor(Math.random() * 5) + 1, // Random priority 1-5
          metadata: {
            testRun: true,
            batchNumber: Math.floor(i / batchSize) + 1,
            jobIndex: i + j + 1,
            createdAt: new Date(),
          },
        });
      }

      try {
        await dren.enqueueBatch(batchJobs);
        createdJobs += batchJobs.length;

        console.log(
          `📦 Created batch ${Math.floor(i / batchSize) + 1}: ${batchJobs.length} jobs (Total: ${createdJobs}/${jobsToCreate})`
        );

        // Small delay between batches to avoid overwhelming the system
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`❌ Failed to create batch ${Math.floor(i / batchSize) + 1}:`, error);
      }
    }

    console.log(`🎉 Successfully created ${createdJobs} test jobs!`);
    console.log('\n📊 Job Distribution:');

    // Show job distribution
    const jobCounts = new Map<string, number>();
    for (const jobType of jobTypes) {
      jobCounts.set(jobType, 0);
    }

    // Count jobs by type (approximate)
    for (let i = 0; i < createdJobs; i++) {
      const jobType = jobTypes[Math.floor(Math.random() * jobTypes.length)];
      jobCounts.set(jobType, (jobCounts.get(jobType) || 0) + 1);
    }

    jobCounts.forEach((count, jobType) => {
      console.log(`  ${jobType}: ~${count} jobs`);
    });

    console.log('\n🔍 Monitoring Dashboard:');
    console.log('  📊 Open http://localhost:3001 to view the monitoring dashboard');
    console.log('  📈 Jobs will start processing with random execution times (1-25 seconds)');
    console.log('  ⏱️  Monitor processing times, success rates, and job volume');
    console.log('  🔄 Some jobs may fail (5% failure rate) to test retry logic');

    console.log('\n📋 Test Scenarios to Observe:');
    console.log('  • Job processing time distribution (1-25 seconds)');
    console.log('  • Priority-based job processing order');
    console.log('  • Concurrent job processing (10 workers)');
    console.log('  • Retry logic for failed jobs');
    console.log('  • Job volume trends over time');
    console.log('  • Success/failure rates by job type');

    console.log('\n🛑 Press Ctrl+C to stop the job queue');

    // Keep the process running
    process.stdin.resume();
  } catch (error) {
    console.error('❌ Failed to populate test jobs:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down test job population...');

  try {
    await dren.stop();
    await dren.disconnect();
    console.log('✅ Dren stopped and disconnected');
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
  }

  process.exit(0);
});

// Start the test
populateTestJobs().catch(console.error);
