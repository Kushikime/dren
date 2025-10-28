#!/usr/bin/env node

import { spawn } from 'child_process';
import { join } from 'path';

console.log('🚀 Starting Dren Test Environment...');
console.log('📊 This will start both the monitoring dashboard and populate test jobs');
console.log('');

// Start monitoring dashboard
console.log('📈 Starting monitoring dashboard on port 3001...');
const monitoringProcess = spawn('pnpm', ['--filter', '@dren/monitoring', 'start'], {
  stdio: 'pipe',
  env: {
    ...process.env,
    MONGO_URL:
      process.env.MONGO_URL ||
      'mongodb://dren_user:dren_password@localhost:27018/dren_test?authSource=dren_test',
    DB_NAME: process.env.DB_NAME || 'dren_test',
    PORT: '3001',
  },
});

monitoringProcess.stdout.on('data', data => {
  console.log(`[MONITORING] ${data.toString().trim()}`);
});

monitoringProcess.stderr.on('data', data => {
  console.error(`[MONITORING ERROR] ${data.toString().trim()}`);
});

// Wait a bit for monitoring to start
setTimeout(() => {
  console.log('');
  console.log('📦 Starting test job population...');

  // Start test job population
  const testProcess = spawn('pnpm', ['test-population'], {
    cwd: join(process.cwd(), 'apps/pinv'),
    stdio: 'inherit',
    env: {
      ...process.env,
      MONGO_URL:
        process.env.MONGO_URL ||
        'mongodb://dren_user:dren_password@localhost:27018/dren_test?authSource=dren_test',
      DB_NAME: process.env.DB_NAME || 'dren_test',
    },
  });

  testProcess.on('close', code => {
    console.log(`\n📦 Test job population finished with code ${code}`);
    console.log('📊 Monitoring dashboard is still running on http://localhost:3001');
    console.log('🛑 Press Ctrl+C to stop everything');
  });
}, 3000); // Wait 3 seconds for monitoring to start

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down test environment...');

  monitoringProcess.kill('SIGINT');

  setTimeout(() => {
    console.log('✅ Test environment stopped');
    process.exit(0);
  }, 2000);
});

// Handle process errors
monitoringProcess.on('error', error => {
  console.error('❌ Failed to start monitoring dashboard:', error);
  process.exit(1);
});
