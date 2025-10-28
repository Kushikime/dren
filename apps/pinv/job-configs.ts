import { JobProcessor, JobConfig } from 'dren';

export const jobConfigs = new Map<string, JobConfig>();

export enum JobName {
  Tmf637PostJob = 'tmf637PostJob',
}

interface Tmf637PostJobPayload {
  // Define your payload structure here
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

jobConfigs.set(JobName.Tmf637PostJob, {
  name: JobName.Tmf637PostJob,
  processor: tmf637PostJobProcessor as JobProcessor<any>,
  maxRetries: 3,
  maxBackoffMs: 1000,
  priority: 1,
});
