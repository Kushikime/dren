# Dren Test Scripts

This directory contains test scripts for demonstrating and testing the Dren job queue system with monitoring and archiving capabilities.

## 🚀 **Quick Start**

### **1. Start Complete Test Environment**

```bash
cd apps/pinv
pnpm test-environment
```

This will:

- Start the monitoring dashboard on http://localhost:3001
- Populate 1000 test jobs with random execution times (1-25 seconds)
- Show real-time job processing in the dashboard

### **2. Individual Scripts**

#### **Test Job Population Only**

```bash
pnpm test-population
```

Populates 1000 jobs with random execution times and starts the job queue.

#### **Monitoring Example**

```bash
pnpm monitoring-example
```

Demonstrates execution timing utilities and monitoring features.

#### **Archiver Example**

```bash
pnpm archiver-example
```

Shows job archiving with date-based sharding.

## 📊 **Test Job Types**

The test script creates 5 different job types with realistic payloads:

1. **DataProcessing** (2-15 seconds)
   - Dataset operations (sum, average, max, min)
   - Random dataset sizes (100-10,000 records)

2. **EmailSending** (1-8 seconds)
   - Bulk email sending
   - Different priority levels and template IDs

3. **FileUpload** (3-25 seconds)
   - File upload simulation
   - Different file types and sizes (1MB-100MB)

4. **ReportGeneration** (5-20 seconds)
   - Report generation with different formats
   - Various report types and date ranges

5. **DataValidation** (1-12 seconds)
   - Data validation with different rules
   - Strict and non-strict validation modes

## 🎯 **Test Scenarios**

### **What to Observe in the Dashboard:**

1. **Job Processing Distribution**
   - Processing times ranging from 1-25 seconds
   - Different job types with varying execution times

2. **Priority Processing**
   - Jobs with priority 1 processed before priority 2
   - Concurrent processing within same priority

3. **Retry Logic**
   - 5% failure rate to test retry mechanisms
   - Exponential backoff for failed jobs

4. **Concurrent Processing**
   - 10 concurrent workers processing jobs
   - Efficient job distribution and load balancing

5. **Real-time Metrics**
   - Success/failure rates by job type
   - Average processing times
   - Job volume trends over time

## 📈 **Monitoring Dashboard Features**

### **Charts & Visualizations:**

- **Processing Time by Job Type**: Bar chart showing average processing times
- **Success Rate by Job Type**: Performance comparison across job types
- **Job Volume Over Time**: Timeline showing job throughput

### **Metrics Cards:**

- Total jobs processed
- Successful vs failed jobs
- Average processing time
- Pending/processing job counts

### **Job Type Performance Table:**

- Detailed metrics per job type
- Min/Max/Average/P95 processing times
- Success rates and failure counts

## 🔧 **Configuration**

### **Environment Variables:**

```bash
MONGO_URL=mongodb://dren_user:dren_password@localhost:27018
DB_NAME=dren
```

### **Job Queue Settings:**

- **Concurrency**: 10 workers
- **Poll Interval**: 500ms (faster for testing)
- **Stuck Job Timeout**: 30 seconds
- **Retry Logic**: 2-5 retries per job type

## 📊 **Expected Results**

### **Job Distribution:**

- ~200 jobs per job type (1000 total)
- Random priorities (1-5)
- Random execution times (1-25 seconds)

### **Performance Metrics:**

- **Success Rate**: ~95% (5% simulated failures)
- **Average Processing Time**: ~8-12 seconds
- **Concurrent Processing**: Up to 10 jobs simultaneously

### **Dashboard Insights:**

- FileUpload jobs typically take longest (3-25s)
- EmailSending jobs are fastest (1-8s)
- ReportGeneration has highest variance (5-20s)
- DataProcessing shows consistent performance (2-15s)

## 🛠️ **Troubleshooting**

### **Common Issues:**

1. **MongoDB Connection Error**
   - Ensure MongoDB is running on port 27018
   - Check credentials: dren_user/dren_password

2. **Monitoring Dashboard Not Loading**
   - Verify port 3001 is available
   - Check if @dren/monitoring is built

3. **Jobs Not Processing**
   - Check worker concurrency settings
   - Verify job configurations are registered

4. **Performance Issues**
   - Reduce batch size in test-population.ts
   - Lower concurrency if system is overloaded

### **Debug Mode:**

```bash
DEBUG=dren:* pnpm test-population
```

## 🎯 **Next Steps**

After running the test:

1. **Explore the Dashboard**: Navigate through different charts and metrics
2. **Test Date Ranges**: Try different time ranges in the dashboard
3. **Monitor Real-time**: Watch jobs process in real-time
4. **Analyze Patterns**: Look for performance patterns and bottlenecks
5. **Test Archiving**: Run the archiver to see job lifecycle management

## 📝 **Customization**

### **Modify Test Parameters:**

- Change execution time ranges in `test-job-population.ts`
- Adjust failure rates and retry logic
- Modify job types and payloads
- Change concurrency and batch sizes

### **Add Custom Job Types:**

```typescript
enum CustomJobType {
  MyCustomJob = 'myCustomJob',
}

// Add processor and configuration
const customProcessor = createRandomProcessor<MyPayload>('myCustomJob', 1, 10);
```

This test environment provides a comprehensive way to evaluate Dren's performance, monitoring capabilities, and job processing efficiency with realistic workloads.
