# @dren/monitoring

Comprehensive monitoring and observability tools for Dren job queue system.

## 🚀 **Features**

- **📊 Real-time Dashboard**: Web UI with interactive charts and metrics
- **⏱️ Execution Timing**: Track method-level performance in job processors
- **📈 Performance Analytics**: Job processing time, success rates, volume trends
- **🎯 Job Type Metrics**: Detailed breakdown by job type
- **📅 Date Range Selection**: Analyze performance over custom time periods

## 🛠️ **Installation**

```bash
pnpm add @dren/monitoring
```

## 🎯 **Quick Start**

### 1. **Start Monitoring Server**

```bash
# Using CLI
npx @dren/monitoring start

# Or with environment variables
MONGO_URL=mongodb://localhost:27017 DB_NAME=dren PORT=3001 npx @dren/monitoring start
```

### 2. **Access Dashboard**

Open your browser to `http://localhost:3001` to view the monitoring dashboard.

### 3. **Add Monitoring to Your Processors**

```typescript
import { ExecutionTimer, withTiming, createMonitoredProcessor } from '@dren/monitoring';

// Method 1: Manual timing
const myProcessor = async (payload: any) => {
  const timer = new ExecutionTimer();

  timer.start('validateData');
  const isValid = validateData(payload);
  timer.end();

  timer.start('processData');
  const result = await processData(payload);
  timer.end();

  return {
    result,
    executionTimings: timer.getTimings(),
    totalExecutionTime: timer.getTotalExecutionTime(),
  };
};

// Method 2: Automatic wrapper
const monitoredProcessor = createMonitoredProcessor(async payload => {
  // Your processor logic
  return { processed: true };
}, 'myProcessor');
```

## 📊 **Dashboard Features**

### **Overview Metrics**

- Total jobs processed
- Success/failure rates
- Average processing time
- Pending/processing job counts

### **Interactive Charts**

- **Processing Time by Job Type**: Bar chart showing average processing time
- **Success Rate by Job Type**: Performance comparison across job types
- **Job Volume Over Time**: Timeline showing job throughput

### **Job Type Performance Table**

- Detailed metrics per job type
- Min/Max/Average/P95 processing times
- Success rates and failure counts

### **Date Range Controls**

- Last 24 hours
- Last 7 days
- Custom date range selection

## 🔧 **API Endpoints**

### **Dashboard Data**

```http
GET /api/dashboard?startDate=2024-01-01T00:00:00&endDate=2024-01-02T00:00:00
```

### **Job Metrics**

```http
GET /api/metrics?startDate=2024-01-01T00:00:00&endDate=2024-01-02T00:00:00
```

### **Job Type Metrics**

```http
GET /api/job-types?startDate=2024-01-01T00:00:00&endDate=2024-01-02T00:00:00
```

### **Chart Data**

```http
GET /api/charts/processing-time?startDate=2024-01-01T00:00:00&endDate=2024-01-02T00:00:00
GET /api/charts/success-rate?startDate=2024-01-01T00:00:00&endDate=2024-01-02T00:00:00
GET /api/charts/job-volume?startDate=2024-01-01T00:00:00&endDate=2024-01-02T00:00:00
```

## ⏱️ **Execution Timing**

### **ExecutionTimer Class**

```typescript
const timer = new ExecutionTimer();

// Start timing a method
timer.start('methodName');

// Do some work
await doWork();

// End timing
timer.end();

// Get results
const timings = timer.getTimings();
const totalTime = timer.getTotalExecutionTime();
const breakdown = timer.getMethodBreakdown();
```

### **withTiming Wrapper**

```typescript
const timedMethod = withTiming(
  async data => {
    // Your method logic
    return processData(data);
  },
  'processData',
  timer
);
```

### **createMonitoredProcessor**

```typescript
const monitoredProcessor = createMonitoredProcessor(async payload => {
  // Your processor logic
  return { result: 'processed' };
}, 'myProcessor');
```

## 🎨 **Customization**

### **Configuration**

```typescript
import { MonitoringServer } from '@dren/monitoring';

const server = new MonitoringServer({
  database: {
    type: 'mongodb',
    url: 'mongodb://localhost:27017',
    dbName: 'myapp',
    collectionName: 'jobs',
  },
  server: {
    port: 3001,
    host: 'localhost',
  },
});

await server.start();
```

### **Environment Variables**

- `MONGO_URL`: MongoDB connection string
- `DB_NAME`: Database name
- `COLLECTION_NAME`: Job collection name
- `PORT`: Server port (default: 3001)
- `HOST`: Server host (default: localhost)

## 📈 **Metrics Explained**

### **Job Metrics**

- **Total Jobs**: All jobs in the time range
- **Successful Jobs**: Jobs with status 'succeeded'
- **Failed Jobs**: Jobs with status 'failed'
- **Pending Jobs**: Jobs waiting to be processed
- **Processing Jobs**: Currently running jobs
- **Average Processing Time**: Mean time from creation to completion
- **Success Rate**: Percentage of successful jobs
- **Failure Rate**: Percentage of failed jobs

### **Job Type Metrics**

- **Min/Max Processing Time**: Fastest and slowest job executions
- **P95 Processing Time**: 95th percentile processing time
- **Median Processing Time**: Middle value of processing times

## 🔍 **Troubleshooting**

### **Common Issues**

1. **Connection Error**: Ensure MongoDB is running and accessible
2. **No Data**: Check date range and ensure jobs exist in the collection
3. **Port Conflict**: Change port via environment variable or config

### **Debug Mode**

```bash
DEBUG=dren:monitoring npx @dren/monitoring start
```

## 🚀 **Advanced Usage**

### **Custom Metrics Collection**

```typescript
import { MetricsService } from '@dren/monitoring';

const metricsService = new MetricsService({
  url: 'mongodb://localhost:27017',
  dbName: 'myapp',
});

await metricsService.connect();

const metrics = await metricsService.getJobMetrics({
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-01-02'),
});

console.log(metrics);
```

### **Integration with Existing Apps**

```typescript
// In your existing Dren application
import { ExecutionTimer } from '@dren/monitoring';

const dren = new Dren({
  // ... your config
  jobConfigs: new Map([
    [
      'monitoredJob',
      {
        name: 'monitoredJob',
        processor: async payload => {
          const timer = new ExecutionTimer();

          timer.start('validation');
          // ... validation logic
          timer.end();

          timer.start('processing');
          // ... processing logic
          timer.end();

          return {
            result: 'success',
            executionTimings: timer.getTimings(),
          };
        },
      },
    ],
  ]),
});
```

## 📝 **License**

MIT License - see LICENSE file for details.
