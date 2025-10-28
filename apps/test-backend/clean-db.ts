import { MongoClient } from 'mongodb';

const mongoUrl =
  process.env.MONGO_URL ||
  'mongodb://dren_user:dren_password@localhost:27018/dren_test?authSource=dren_test';
const dbName = process.env.DB_NAME || 'dren_test';

async function cleanDatabase() {
  console.log('🧹 Cleaning Dren database...');

  const client = new MongoClient(mongoUrl);
  await client.connect();
  const db = client.db(dbName);

  try {
    // Clean job-queue collection
    const jobQueueResult = await db.collection('job-queue').deleteMany({});
    console.log(`✅ Cleaned job-queue: ${jobQueueResult.deletedCount} documents`);

    // Clean results collection
    const resultsResult = await db.collection('results').deleteMany({});
    console.log(`✅ Cleaned results: ${resultsResult.deletedCount} documents`);

    // List all collections
    const collections = await db.listCollections().toArray();
    console.log(`📁 Collections in database: ${collections.map(c => c.name).join(', ')}`);

    console.log('🎉 Database cleaned successfully!');
  } catch (error) {
    console.error('❌ Error cleaning database:', error);
    throw error;
  } finally {
    await client.close();
    console.log('🔌 Connection closed');
  }
}

// Run if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  cleanDatabase().catch(error => {
    console.error('❌ Cleanup failed:', error);
    process.exit(1);
  });
}

export { cleanDatabase };
