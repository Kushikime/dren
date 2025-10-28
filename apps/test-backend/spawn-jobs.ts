#!/usr/bin/env node

import { Dren } from 'dren';
import { drenConfig } from './src/config.js';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * System info job processor
 */
const systemInfoProcessor = async (payload: { command: string }, context: any) => {
  console.log(`🖥️  Processing job ${context.jobId}: ${payload.command}`);

  const { stdout, stderr } = await execAsync(payload.command);

  const result = {
    command: payload.command,
    output: stdout.trim(),
    error: stderr.trim(),
    timestamp: new Date().toISOString(),
    hostname: process.env.HOSTNAME || 'unknown',
    pid: process.pid,
  };

  console.log(`✅ Completed: ${payload.command} (${result.output.length} chars)`);
};

/**
 * Create and spawn jobs
 */
async function spawnJobs(count: number = 10) {
  console.log(`🚀 Spawning ${count} system info jobs...`);

  // Configure job processor
  drenConfig.jobConfigs.set('system-info', {
    name: 'system-info',
    processor: systemInfoProcessor,
    maxRetries: 2,
    maxBackoffMs: 10000,
    priority: 1,
  });

  // Initialize Dren
  const dren = new Dren(drenConfig);
  await dren.initialize();

  // Create jobs
  const commands = [
    'uname -a',
    'df -h',
    'ps aux | head -5',
    'date',
    'whoami',
    'pwd',
    'uptime',
    'ls -la',
    'echo "Hello from job queue!"',
    'node --version',
  ];

  const jobs = Array.from({ length: count }, (_, i) => ({
    name: 'system-info',
    payload: { command: commands[i % commands.length] },
    priority: i < 5 ? 1 : 2,
  }));

  const jobIds = await dren.enqueueBatch(jobs);

  console.log(`✅ Created ${jobIds.length} jobs`);
  jobIds.forEach((id, index) => {
    console.log(`  ${index + 1}. ${id} - ${jobs[index].payload.command}`);
  });

  // Start processing
  console.log('\n🔄 Starting worker...');
  await dren.start();

  // Let it run for a bit
  console.log('⏳ Processing for 20 seconds...');
  await new Promise(resolve => setTimeout(resolve, 20000));

  // Stop gracefully
  console.log('\n🛑 Stopping worker...');
  await dren.stop();
  await dren.disconnect();

  console.log('✅ Done!');
}

// Get count from command line args
const count = parseInt(process.argv[2]) || 10;

spawnJobs(count).catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});
