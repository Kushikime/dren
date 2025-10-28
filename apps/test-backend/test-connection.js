import { MongoClient } from 'mongodb';

const mongoUrl =
  process.env.MONGO_URL ||
  'mongodb://dren_user:dren_password@localhost:27018/dren_test?authSource=dren_test';
const dbName = process.env.DB_NAME || 'dren_test';

async function testConnection() {
  console.log('🔌 Testing MongoDB connection...');

  try {
    const client = new MongoClient(mongoUrl);
    await client.connect();

    console.log('✅ Connected to MongoDB successfully!');

    // Test database access
    const db = client.db(dbName);
    const collections = await db.listCollections().toArray();

    console.log(`📊 Database: ${dbName}`);
    console.log(`📁 Collections: ${collections.length}`);

    // Test user authentication
    await db.command({ ping: 1 });
    console.log('✅ Database ping successful!');

    await client.close();
    console.log('🔌 Connection closed gracefully');
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
