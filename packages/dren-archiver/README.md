# @dren/archiver

Job archiving and cleanup utilities for Dren job queue system with date-based sharding.

## 🎯 **Features**

- **📦 Date-based Sharding**: Archive jobs by processing date (YYYY-MM-DD format)
- **⏰ Scheduled Archiving**: Daily cron-based archiving of completed jobs
- **🗑️ Automatic Cleanup**: Remove archived jobs from main queue
- **📊 Retention Policies**: Configurable archive and deletion policies
- **🔍 Query Interface**: Query archived jobs by date range and job type
- **📈 Status Monitoring**: Track archiving statistics and collection info

## 🛠️ **Installation**

```bash
pnpm add @dren/archiver
```

## 🚀 **Quick Start**

### 1. **Start Archiver Service**

```bash
# Using CLI
npx @dren/archiver start

# Or with environment variables
MONGO_URL=mongodb://localhost:27017 DB_NAME=dren npx @dren/archiver start
```

### 2. **Run Manual Archiving**

```bash
# Archive jobs manually
npx @dren/archiver run
```

### 3. **Check Status**

```bash
# View archiver status and statistics
npx @dren/archiver status
```

### 4. **Query Archived Jobs**

```bash
# Query archived jobs by date range
npx @dren/archiver query 2024-01-01 2024-01-31

# Query specific job type
npx @dren/archiver query 2024-01-01 2024-01-31 myJobType
```

## 📦 **Archiving Strategy**

### **Date-based Sharding**

Jobs are archived into collections named by their processing date:

- `job-archive-2024-01-15` - Jobs processed on January 15, 2024
- `job-archive-2024-01-16` - Jobs processed on January 16, 2024
- `job-archive-2024-01-17` - Jobs processed on January 17, 2024

### **Archiving Process**

1. **Find Jobs**: Query main collection for `succeeded` jobs older than retention period
2. **Group by Date**: Group jobs by their `processedAt` date
3. **Create Archive Collections**: Create date-based collections with proper indexes
4. **Archive Jobs**: Insert jobs into archive collections with shard key
5. **Clean Main Queue**: Delete archived jobs from main collection
6. **Cleanup Old Archives**: Remove archive collections older than deletion policy

### **Job Lifecycle**

```
Job Created → Processing → Succeeded → Archived (after N days) → Deleted (after M days)
```

## ⚙️ **Configuration**

### **Environment Variables**

```bash
# Database connection
MONGO_URL=mongodb://localhost:27017
DB_NAME=dren
MAIN_COLLECTION=job-queue
ARCHIVE_PREFIX=job-archive

# Scheduling
CRON_EXPRESSION=0 2 * * *  # 2 AM daily
TIMEZONE=UTC

# Retention policies
ARCHIVE_AFTER_DAYS=1        # Archive jobs older than 1 day
DELETE_AFTER_DAYS=90        # Delete archives older than 90 days

# Performance
BATCH_SIZE=1000             # Batch size for operations
```

### **Programmatic Configuration**

```typescript
import { JobArchiver } from '@dren/archiver';

const archiver = new JobArchiver({
  database: {
    type: 'mongodb',
    url: 'mongodb://localhost:27017',
    dbName: 'myapp',
    mainCollectionName: 'jobs',
    archiveCollectionPrefix: 'archived-jobs',
  },
  schedule: {
    cronExpression: '0 3 * * *', // 3 AM daily
    timezone: 'America/New_York',
  },
  retention: {
    archiveAfterDays: 2, // Archive after 2 days
    deleteAfterDays: 180, // Keep archives for 6 months
  },
  batchSize: 500,
});

await archiver.connect();
await archiver.start();
```

## 📊 **Archive Collection Structure**

### **Collection Naming**

- Format: `{prefix}-{YYYY-MM-DD}`
- Example: `job-archive-2024-01-15`

### **Document Structure**

```typescript
interface ArchivedJobDocument {
  // Original job fields
  _id: ObjectId;
  name: string;
  payload: any;
  status: 'succeeded';
  result?: any;
  // ... other job fields

  // Archive-specific fields
  shardKey: string; // "2024-01-15"
  archivedAt: Date; // When job was archived
  originalCollection: string; // "job-queue"
}
```

### **Indexes**

Each archive collection has optimized indexes:

- `{ shardKey: 1 }` - For shard-based queries
- `{ archivedAt: 1 }` - For time-based queries
- `{ name: 1, archivedAt: 1 }` - For job type queries
- `{ status: 1, archivedAt: 1 }` - For status queries

## 🔍 **Querying Archived Jobs**

### **CLI Queries**

```bash
# Query by date range
npx @dren/archiver query 2024-01-01 2024-01-31

# Query specific job type
npx @dren/archiver query 2024-01-01 2024-01-31 emailProcessor

# Query single day
npx @dren/archiver query 2024-01-15 2024-01-15
```

### **Programmatic Queries**

```typescript
// Get archived jobs for date range
const jobs = await archiver.getArchivedJobs('2024-01-01', '2024-01-31');

// Get specific job type
const emailJobs = await archiver.getArchivedJobs('2024-01-01', '2024-01-31', 'emailProcessor');

// Process archived jobs
jobs.forEach(job => {
  console.log(`${job.name} - ${job.shardKey} - ${job.result}`);
});
```

## 📈 **Monitoring & Status**

### **Status Information**

```typescript
const status = await archiver.getStatus();

console.log('Archiver Status:', {
  isRunning: status.isRunning,
  lastRun: status.lastRun,
  nextRun: status.nextRun,
  totalJobsArchived: status.totalJobsArchived,
  totalJobsDeleted: status.totalJobsDeleted,
  archiveCollections: status.archiveCollections.length,
});
```

### **Archive Collection Info**

```typescript
status.archiveCollections.forEach(collection => {
  console.log(`${collection.collectionName}:`, {
    shardKey: collection.shardKey,
    jobCount: collection.jobCount,
    dateRange: collection.dateRange,
    createdAt: collection.createdAt,
  });
});
```

## 🎯 **Use Cases**

### **1. Production Job Queue Cleanup**

```typescript
// Archive completed jobs daily to keep main queue lean
const archiver = new JobArchiver({
  database: {
    /* config */
  },
  schedule: { cronExpression: '0 2 * * *' },
  retention: { archiveAfterDays: 1 },
});
```

### **2. Compliance & Audit**

```typescript
// Keep archives for compliance requirements
const archiver = new JobArchiver({
  database: {
    /* config */
  },
  retention: {
    archiveAfterDays: 1,
    deleteAfterDays: 2555, // 7 years
  },
});
```

### **3. Analytics & Reporting**

```typescript
// Query archived jobs for historical analysis
const jobs = await archiver.getArchivedJobs('2024-01-01', '2024-12-31');
const analytics = analyzeJobTrends(jobs);
```

### **4. Cost Optimization**

```typescript
// Archive frequently, delete aggressively
const archiver = new JobArchiver({
  retention: {
    archiveAfterDays: 1, // Archive daily
    deleteAfterDays: 30, // Keep only 1 month
  },
});
```

## 🔧 **Integration with Dren**

### **With Monitoring**

```typescript
import { Dren } from 'dren';
import { JobArchiver } from '@dren/archiver';

// Start job queue
const dren = new Dren({
  /* config */
});
await dren.initialize();
await dren.start();

// Start archiver
const archiver = new JobArchiver({
  /* config */
});
await archiver.connect();
await archiver.start();
```

### **With Custom Processors**

```typescript
// Processors can check if jobs are archived
const processor = async (payload, context) => {
  // Check if job exists in main queue
  const job = await dren.getJob(context.jobId);

  if (!job) {
    // Job might be archived, check archives
    const archivedJobs = await archiver.getArchivedJobs(
      new Date().toISOString().split('T')[0],
      new Date().toISOString().split('T')[0],
      context.jobType
    );

    const archivedJob = archivedJobs.find(j => j._id.toString() === context.jobId);
    if (archivedJob) {
      console.log('Job was archived:', archivedJob.shardKey);
    }
  }

  // Process job...
};
```

## 🚨 **Best Practices**

### **1. Retention Policies**

- Archive frequently (1-2 days) to keep main queue lean
- Set appropriate deletion policies based on compliance needs
- Monitor archive collection sizes

### **2. Performance**

- Use appropriate batch sizes for your workload
- Schedule archiving during low-traffic periods
- Monitor archiving performance and adjust batch sizes

### **3. Monitoring**

- Set up alerts for archiving failures
- Monitor archive collection growth
- Track archiving statistics

### **4. Backup**

- Ensure archive collections are included in backups
- Test restore procedures for archived data
- Consider cross-region replication for critical archives

## 🔍 **Troubleshooting**

### **Common Issues**

1. **Archiving Fails**: Check MongoDB connection and permissions
2. **No Jobs Archived**: Verify retention policy and job statuses
3. **Performance Issues**: Adjust batch size and schedule timing
4. **Storage Growth**: Review deletion policies and cleanup frequency

### **Debug Mode**

```bash
DEBUG=dren:archiver npx @dren/archiver start
```

## 📝 **License**

MIT License - see LICENSE file for details.
