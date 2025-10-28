import { Dren } from 'dren';
import { jobConfigs } from './job-configs';
import { JobDocument, DatabaseAdapter } from 'dren';

const main = async () => {
  const dren = new Dren({
    database: {
      type: 'mongodb',
      url: process.env.MONGO_URL!,
      dbName: process.env.DB_NAME!,
    },
    jobConfigs,
    workerOptions: {
      pollIntervalMs: 1000,
      concurrency: 1,
      customErrorHandler: async (error: Error, job: JobDocument, adapter: DatabaseAdapter) => {
        console.error('Error in job', error.message);

        console.error('Job', job);

        const customErrorWrapper = {
          attempt: job.attempts,
          error: error.message,
          timestamp: new Date(),
          stackTrace: error.stack || '',
        };

        // Use the adapter to update the job
        await adapter.addJobError(job._id.toString(), customErrorWrapper);
        await adapter.updateJobStatus(job._id.toString(), 'failed');
      },
    },
  });
  await dren.initialize();
  await dren.start();
  console.log('Dren started');
};

main().catch(console.error);
