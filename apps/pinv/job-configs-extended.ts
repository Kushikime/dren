import { JobProcessor, JobConfig } from 'dren';

export const jobConfigs = new Map<string, JobConfig>();

export enum JobName {
  Tmf637PostJob = 'tmf637PostJob',
  DataProcessingJob = 'dataProcessingJob',
  FileUploadJob = 'fileUploadJob',
  NotificationJob = 'notificationJob',
}

interface Tmf637PostJobPayload {
  data: string;
}

interface DataProcessingJobPayload {
  inputData: any[];
  operation: string;
}

interface FileUploadJobPayload {
  fileName: string;
  fileSize: number;
  uploadUrl: string;
}

interface NotificationJobPayload {
  userId: string;
  message: string;
  channel: string;
}

// Example 1: Return structured data
const tmf637PostJobProcessor: JobProcessor<Tmf637PostJobPayload> = async (
  payload: Tmf637PostJobPayload
) => {
  console.log('Processing tmf637 post job', payload);

  // Simulate some processing
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Return a structured result
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

// Example 2: Return processed data
const dataProcessingJobProcessor: JobProcessor<DataProcessingJobPayload> = async (
  payload: DataProcessingJobPayload
) => {
  console.log('Processing data:', payload.operation);

  // Process the data based on operation
  let result: any;
  switch (payload.operation) {
    case 'sum':
      result = payload.inputData.reduce((acc, val) => acc + val, 0);
      break;
    case 'average':
      result = payload.inputData.reduce((acc, val) => acc + val, 0) / payload.inputData.length;
      break;
    case 'max':
      result = Math.max(...payload.inputData);
      break;
    default:
      result = payload.inputData;
  }

  return {
    operation: payload.operation,
    result,
    processedCount: payload.inputData.length,
    timestamp: new Date(),
  };
};

// Example 3: Return file upload result
const fileUploadJobProcessor: JobProcessor<FileUploadJobPayload> = async (
  payload: FileUploadJobPayload
) => {
  console.log(`Uploading file: ${payload.fileName}`);

  // Simulate file upload
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Return upload result
  return {
    fileName: payload.fileName,
    fileSize: payload.fileSize,
    uploadUrl: payload.uploadUrl,
    uploadedAt: new Date(),
    fileId: `file_${Date.now()}`,
    status: 'uploaded',
  };
};

// Example 4: Return notification result
const notificationJobProcessor: JobProcessor<NotificationJobPayload> = async (
  payload: NotificationJobPayload
) => {
  console.log(`Sending notification to ${payload.userId} via ${payload.channel}`);

  // Simulate notification sending
  await new Promise(resolve => setTimeout(resolve, 500));

  // Return notification result
  return {
    userId: payload.userId,
    message: payload.message,
    channel: payload.channel,
    sentAt: new Date(),
    notificationId: `notif_${Date.now()}`,
    status: 'sent',
  };
};

// Register all job configs
jobConfigs.set(JobName.Tmf637PostJob, {
  name: JobName.Tmf637PostJob,
  processor: tmf637PostJobProcessor as JobProcessor<any>,
  maxRetries: 3,
  maxBackoffMs: 1000,
  priority: 1,
});

jobConfigs.set(JobName.DataProcessingJob, {
  name: JobName.DataProcessingJob,
  processor: dataProcessingJobProcessor as JobProcessor<any>,
  maxRetries: 2,
  maxBackoffMs: 2000,
  priority: 2,
});

jobConfigs.set(JobName.FileUploadJob, {
  name: JobName.FileUploadJob,
  processor: fileUploadJobProcessor as JobProcessor<any>,
  maxRetries: 5,
  maxBackoffMs: 5000,
  priority: 1,
});

jobConfigs.set(JobName.NotificationJob, {
  name: JobName.NotificationJob,
  processor: notificationJobProcessor as JobProcessor<any>,
  maxRetries: 3,
  maxBackoffMs: 1000,
  priority: 3,
});
