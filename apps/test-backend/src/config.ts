import 'dotenv/config';
import type { DrenConfig } from 'dren';

// MongoDB connection configuration
const mongoUrl =
  process.env.MONGO_URL ||
  'mongodb://dren_user:dren_password@localhost:27018/dren_test?authSource=dren_test';
const dbName = process.env.DB_NAME || 'dren_test';

// Dren configuration
export const drenConfig: DrenConfig = {
  database: {
    type: 'mongodb',
    url: mongoUrl,
    dbName: dbName,
    collectionName: 'job-queue', // Optional, defaults to 'job-queue'
  },
  jobConfigs: new Map(), // Will be populated with actual job configs
  workerOptions: {
    pollIntervalMs: 5000,
    concurrency: 1,
    stuckJobTimeoutMs: 24 * 60 * 60 * 1000, // 24 hours
  },
};

// Application settings
export const appConfig = {
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
} as const;

// Validate required environment variables
if (!process.env.MONGO_URL) {
  console.warn('⚠️  MONGO_URL not set, using default localhost:27018');
}

console.log('🔧 Configuration loaded:', {
  database: {
    type: drenConfig.database.type,
    url: drenConfig.database.url.replace(/\/\/.*@/, '//***:***@'), // Hide credentials
    dbName: drenConfig.database.dbName,
    collectionName: drenConfig.database.collectionName,
  },
  port: appConfig.port,
  nodeEnv: appConfig.nodeEnv,
});
