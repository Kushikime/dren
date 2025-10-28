import { JobProcessor, JobConfig } from 'dren';

export const jobConfigs = new Map<string, JobConfig>();

export enum JobName {
  Tmf637PostJob = 'tmf637PostJob',
  Tmf637PatchJob = 'tmf637PatchJob',
}

interface Tmf637PostJobPayload {
  // Define your payload structure here
  data: string;
}

interface Tmf637PatchJobPayload {
  data: string;
}

const tmf637PostJobProcessor: JobProcessor<Tmf637PostJobPayload> = async (
  payload: Tmf637PostJobPayload
) => {
  console.log('Processing tmf637 post job', payload);

  // Simulate some processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Return a result that will be stored in the job document
  return {
    processedAt: new Date(),
    data: payload.data,
    status: 'completed',
    metadata: {
      processor: 'tmf637',
      version: '1.0.0',
    },
  };
};

const tmf637PatchJobProcessor: JobProcessor<Tmf637PatchJobPayload> = async (
  payload: Tmf637PatchJobPayload
) => {
  console.log('Processing tmf637 patch job', payload);

  // Simulate some processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Return a result that will be stored in the job document
  return {
    processedAt: new Date(),
    data: payload.data,
    status: 'completed',
    metadata: {
      processor: 'tmf637',
      version: '1.0.0',
    },
  };
};

jobConfigs.set(JobName.Tmf637PostJob, {
  name: JobName.Tmf637PostJob,
  processor: tmf637PostJobProcessor as JobProcessor<any>,
  maxRetries: 3,
  maxBackoffMs: 1000,
  priority: 1,
});

jobConfigs.set(JobName.Tmf637PatchJob, {
  name: JobName.Tmf637PatchJob,
  processor: tmf637PatchJobProcessor as JobProcessor<any>,
  maxRetries: 3,
  maxBackoffMs: 1000,
  priority: 2,
});
