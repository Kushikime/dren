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
};

jobConfigs.set(JobName.Tmf637PostJob, {
  name: JobName.Tmf637PostJob,
  processor: tmf637PostJobProcessor as JobProcessor<any>,
  maxRetries: 3,
  maxBackoffMs: 1000,
  priority: 1,
});
