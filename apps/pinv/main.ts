import { Dren } from 'dren';
import { jobConfigs } from './job-configs';
import { JobDocument, DatabaseConnection } from 'dren';

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
      customErrorHandler: async (error: Error, job: JobDocument, dbClient: DatabaseConnection) => {
        console.error('Error in job', error.message);

        console.error('Job', job);

        const customErrorWrapper = {
          attempt: job.attempts,
          error: error.message,
          timestamp: new Date(),
          stackTrace: error.stack || '',
        };

        await dbClient.collection.updateOne(
          { _id: job._id },
          { $set: { status: 'failed', errors: [...job.errors, customErrorWrapper] } }
        );
      },
    },
  });
  await dren.initialize();
  await dren.start();
  console.log('Dren started');
};

main().catch(console.error);
