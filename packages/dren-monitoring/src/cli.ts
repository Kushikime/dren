#!/usr/bin/env node

import { MonitoringServer } from './server.js';
import type { MonitoringConfig } from './types.js';

const config: MonitoringConfig = {
  database: {
    type: 'mongodb',
    url: process.env.MONGO_URL || 'mongodb://localhost:27017',
    dbName: process.env.DB_NAME || 'dren',
    collectionName: process.env.COLLECTION_NAME || 'job-queue',
  },
  server: {
    port: parseInt(process.env.PORT || '3001'),
    host: process.env.HOST || 'localhost',
  },
};

const server = new MonitoringServer(config);

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down monitoring server...');
  await server.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Shutting down monitoring server...');
  await server.stop();
  process.exit(0);
});

// Start server
server.start().catch((error: Error) => {
  console.error('❌ Failed to start monitoring server:', error);
  process.exit(1);
});
