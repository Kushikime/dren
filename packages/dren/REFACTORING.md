# Dren Job Queue - Refactored Architecture

## 🏗️ **Modular Architecture Overview**

The Dren library has been refactored into a modular, extensible architecture with clear separation of concerns:

### **Core Components:**

1. **Database Abstraction Layer**
   - `DatabaseAdapter` - Base interface for all database operations
   - `MongoDBAdapter` - MongoDB implementation
   - `DatabaseFactory` - Creates appropriate adapters

2. **Service Layer**
   - `JobService` - Handles job CRUD operations
   - `WorkerService` - Manages worker lifecycle and job processing

3. **Main Orchestrator**
   - `Dren` - Main class that coordinates all services

## 🔧 **Key Benefits:**

- **Database Agnostic**: Easy to add new database adapters (CosmosDB, PostgreSQL, etc.)
- **Modular**: Each component has a single responsibility
- **Testable**: Services can be tested independently
- **Extensible**: Easy to add new features without breaking existing code

## 📦 **Usage Examples:**

### **Basic Setup:**

```typescript
import { Dren } from 'dren';

const dren = new Dren({
  database: {
    type: 'mongodb',
    url: 'mongodb://localhost:27017',
    dbName: 'myapp',
  },
  jobConfigs: new Map([
    [
      'my-job',
      {
        name: 'my-job',
        processor: async payload => {
          console.log('Processing job:', payload);
        },
        maxRetries: 3,
        maxBackoffMs: 5000,
      },
    ],
  ]),
});

await dren.initialize();
await dren.start();
```

### **Job Processors with Return Values:**

```typescript
// Processors can now return any value that gets stored in the job result
const myJobProcessor: JobProcessor<MyPayload> = async payload => {
  console.log('Processing job:', payload);

  // Do some work
  const processedData = await processData(payload);

  // Return any value - it will be stored in job.result
  return {
    processedAt: new Date(),
    data: processedData,
    status: 'completed',
    metadata: { version: '1.0.0' },
  };
};

// Or return simple values
const simpleProcessor: JobProcessor<string> = async data => {
  return `Processed: ${data}`;
};

// Or return nothing (undefined)
const noResultProcessor: JobProcessor<any> = async payload => {
  // Do work but don't return anything
  await doWork(payload);
  // No return statement - result will be undefined
};
```

### **Custom Error Handling:**

```typescript
const dren = new Dren({
  // ... database config
  jobConfigs,
  workerOptions: {
    customErrorHandler: async (error, job, adapter) => {
      // Custom error handling logic
      console.error('Job failed:', error.message);

      // Use adapter methods instead of direct database access
      await adapter.addJobError(job._id.toString(), {
        attempt: job.attempts,
        error: error.message,
        timestamp: new Date(),
        stackTrace: error.stack || '',
      });

      await adapter.updateJobStatus(job._id.toString(), 'failed');
    },
  },
});
```

## 🔄 **Migration from Old Architecture:**

### **Breaking Changes:**

1. **DatabaseConnection Interface**: Now uses `DatabaseAdapter` instead of direct MongoDB objects
2. **Custom Error Handlers**: Now receive `DatabaseAdapter` instead of `DatabaseConnection`
3. **Direct Database Access**: Use adapter methods instead of direct collection access

### **Migration Steps:**

1. **Update Imports:**

   ```typescript
   // Old
   import { DatabaseConnection } from 'dren';

   // New
   import { DatabaseAdapter } from 'dren';
   ```

2. **Update Error Handlers:**

   ```typescript
   // Old
   customErrorHandler: async (error, job, dbClient: DatabaseConnection) => {
     await dbClient.collection.updateOne(/* ... */);
   };

   // New
   customErrorHandler: async (error, job, adapter: DatabaseAdapter) => {
     await adapter.updateJobStatus(job._id.toString(), 'failed');
   };
   ```

3. **Update Direct Database Access:**

   ```typescript
   // Old
   const collection = dren.connection.collection;

   // New
   const adapter = dren.databaseAdapter;
   const job = await adapter.findJobById(jobId);
   ```

## 🚀 **Future Extensibility:**

### **Adding New Database Adapters:**

```typescript
// Create new adapter
export class CosmosDBAdapter implements DatabaseAdapter {
  async connect(): Promise<DatabaseConnection> {
    // CosmosDB connection logic
  }

  async createJob<T>(jobDoc: Omit<JobDocument<T>, '_id'>): Promise<string> {
    // CosmosDB job creation logic
  }

  // ... implement all other methods
}

// Register in factory
export class DatabaseFactory {
  static createAdapter(config: DatabaseConfig): DatabaseAdapter {
    switch (config.type) {
      case 'cosmosdb':
        return new CosmosDBAdapter(config);
      // ... other cases
    }
  }
}
```

### **Custom Job Services:**

```typescript
// Extend JobService for custom logic
export class CustomJobService extends JobService {
  async enqueueWithDelay<T>(jobInput: JobInput<T>, delayMs: number): Promise<string> {
    // Custom delayed job logic
  }
}
```

## 📊 **Architecture Diagram:**

```
┌─────────────────┐
│      Dren       │ ← Main orchestrator
└─────────────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│JobSvc │ │WorkerSvc│ ← Service layer
└───┬───┘ └──┬────┘
    │         │
    └────┬────┘
         │
┌────────▼────────┐
│ DatabaseAdapter │ ← Database abstraction
└────────┬────────┘
         │
    ┌────┴────┐
    │         │
┌───▼───┐ ┌──▼────┐
│MongoDB│ │CosmosDB│ ← Specific implementations
└───────┘ └───────┘
```

This refactored architecture provides a solid foundation for future enhancements while maintaining backward compatibility where possible.
