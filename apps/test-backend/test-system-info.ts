import { Dren, type JobProcessor } from 'dren';
import { drenConfig } from './src/config.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * System info job processor
 * Gets system information and stores it in the job result
 */
const systemInfoProcessor: JobProcessor<{ command: string }> = async (payload, context) => {
  console.log(`🖥️  Processing system info job ${context.jobId} (attempt ${context.attempt})`);

  try {
    // Execute the system command
    const { stdout, stderr } = await execAsync(payload.command);

    // Store result in job document
    const result = {
      command: payload.command,
      output: stdout.trim(),
      error: stderr.trim(),
      timestamp: new Date().toISOString(),
      hostname: process.env.HOSTNAME || 'unknown',
      pid: process.pid,
    };

    console.log(`✅ Command executed successfully: ${payload.command}`);
    console.log(`📊 Output length: ${result.output.length} characters`);

    // Note: In a real implementation, we'd store this result in the job document
    // For now, we'll just log it since we don't have a result field in our schema yet
  } catch (error) {
    console.error(`❌ Command failed: ${payload.command}`, error);
    throw error;
  }
};

/**
 * Initialize Dren with system info job processor
 */
async function initializeDren() {
  // Configure job types
  drenConfig.jobConfigs.set('system-info', {
    name: 'system-info',
    processor: systemInfoProcessor,
    maxRetries: 3,
    maxBackoffMs: 30000, // 30 seconds max backoff
    priority: 1, // High priority
  });

  // Initialize Dren
  const dren = new Dren(drenConfig);
  await dren.initialize();

  return dren;
}

/**
 * Create and enqueue 10 system info jobs
 */
async function createJobs() {
  console.log('🚀 Creating 10 system info jobs...');

  const dren = await initializeDren();

  const commands = [
    'uname -a',
    'df -h',
    'free -h',
    'ps aux | head -10',
    'ls -la /tmp',
    'date',
    'whoami',
    'pwd',
    'env | head -5',
    'uptime',
  ];

  const jobs = commands.map((command, index) => ({
    name: 'system-info',
    payload: { command },
    priority: index < 5 ? 1 : 2, // First 5 jobs have higher priority
  }));

  console.log('📝 Enqueueing jobs...');
  const jobIds = await dren.enqueueBatch(jobs);

  console.log(`✅ Created ${jobIds.length} jobs:`);
  jobIds.forEach((id, index) => {
    console.log(`  ${index + 1}. ${id} - ${commands[index]}`);
  });

  return { dren, jobIds };
}

/**
 * Start processing jobs
 */
async function startProcessing() {
  const { dren } = await createJobs();

  console.log('\n🔄 Starting job processing...');
  await dren.start();

  // Let it run for a bit
  console.log('⏳ Processing jobs for 30 seconds...');
  await new Promise(resolve => setTimeout(resolve, 30000));

  console.log('\n🛑 Stopping worker...');
  await dren.stop();
  await dren.disconnect();

  console.log('✅ Test completed!');
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  startProcessing().catch(error => {
    console.error('❌ Test failed:', error);
    process.exit(1);
  });
}
