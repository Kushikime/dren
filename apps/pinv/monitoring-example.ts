import { Dren } from 'dren';
import { ExecutionTimer, withTiming, createMonitoredProcessor } from '@dren/monitoring';
import { jobConfigs } from './job-configs';

// Example 1: Using ExecutionTimer in a processor
const dataProcessingJobProcessor = async (payload: { data: number[] }) => {
  const timer = new ExecutionTimer();

  // Time data validation
  timer.start('validateData');
  const isValid = payload.data.every(n => typeof n === 'number' && !isNaN(n));
  timer.end();

  if (!isValid) {
    throw new Error('Invalid data provided');
  }

  // Time data processing
  timer.start('processData');
  const sum = payload.data.reduce((acc, val) => acc + val, 0);
  const average = sum / payload.data.length;
  const max = Math.max(...payload.data);
  const min = Math.min(...payload.data);
  timer.end();

  // Time result formatting
  timer.start('formatResult');
  const result = {
    sum,
    average,
    max,
    min,
    count: payload.data.length,
    processedAt: new Date(),
  };
  timer.end();

  // Return result with timing data
  return {
    result,
    executionTimings: timer.getTimings(),
    totalExecutionTime: timer.getTotalExecutionTime(),
    methodBreakdown: timer.getMethodBreakdown(),
  };
};

// Example 2: Using withTiming wrapper
const validateData = async (data: any[]) => {
  await new Promise(resolve => setTimeout(resolve, 100)); // Simulate work
  return data.every(item => item !== null && item !== undefined);
};

const processData = async (data: number[]) => {
  await new Promise(resolve => setTimeout(resolve, 200)); // Simulate work
  return data.reduce((acc, val) => acc + val, 0);
};

const formatResult = async (sum: number, count: number) => {
  await new Promise(resolve => setTimeout(resolve, 50)); // Simulate work
  return { sum, average: sum / count };
};

const advancedDataProcessor = async (payload: { data: number[] }) => {
  const timer = new ExecutionTimer();

  // Wrap methods with timing
  const timedValidate = withTiming(validateData, 'validateData', timer);
  const timedProcess = withTiming(processData, 'processData', timer);
  const timedFormat = withTiming(formatResult, 'formatResult', timer);

  const isValid = await timedValidate(payload.data);
  if (!isValid) {
    throw new Error('Invalid data');
  }

  const sum = await timedProcess(payload.data);
  const result = await timedFormat(sum, payload.data.length);

  return {
    result,
    executionTimings: timer.getTimings(),
    totalExecutionTime: timer.getTotalExecutionTime(),
    methodBreakdown: timer.getMethodBreakdown(),
  };
};

// Example 3: Using createMonitoredProcessor
const simpleProcessor = async (payload: { message: string }) => {
  console.log('Processing message:', payload.message);

  // Simulate some work
  await new Promise(resolve => setTimeout(resolve, 1000));

  return {
    processedMessage: payload.message.toUpperCase(),
    timestamp: new Date(),
  };
};

// Wrap the processor with monitoring
const monitoredSimpleProcessor = createMonitoredProcessor(simpleProcessor, 'simpleProcessor');

// Register job configs with monitoring
jobConfigs.set('dataProcessing', {
  name: 'dataProcessing',
  processor: dataProcessingJobProcessor as any,
  maxRetries: 3,
  maxBackoffMs: 1000,
  priority: 1,
});

jobConfigs.set('advancedDataProcessing', {
  name: 'advancedDataProcessing',
  processor: advancedDataProcessor as any,
  maxRetries: 3,
  maxBackoffMs: 1000,
  priority: 1,
});

jobConfigs.set('simpleProcessing', {
  name: 'simpleProcessing',
  processor: monitoredSimpleProcessor as any,
  maxRetries: 3,
  maxBackoffMs: 1000,
  priority: 2,
});

// Initialize Dren with monitoring
const dren = new Dren({
  database: {
    type: 'mongodb',
    url: process.env.MONGO_URL!,
    dbName: process.env.DB_NAME!,
  },
  jobConfigs,
  workerOptions: {
    pollIntervalMs: 1000,
    concurrency: 2,
  },
});

async function main() {
  await dren.initialize();
  await dren.start();

  // Enqueue some test jobs
  await dren.enqueue({
    name: 'dataProcessing',
    payload: { data: [1, 2, 3, 4, 5] },
  });

  await dren.enqueue({
    name: 'advancedDataProcessing',
    payload: { data: [10, 20, 30, 40, 50] },
  });

  await dren.enqueue({
    name: 'simpleProcessing',
    payload: { message: 'Hello, Dren Monitoring!' },
  });

  console.log('✅ Jobs enqueued with monitoring enabled');
  console.log('📊 Start the monitoring server with: pnpm --filter @dren/monitoring start');
}

main().catch(console.error);
