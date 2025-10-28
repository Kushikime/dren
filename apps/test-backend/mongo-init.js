// MongoDB initialization script
// This script runs when the MongoDB container starts for the first time

// Switch to the test database
db = db.getSiblingDB('dren_test');

// Create a test user for the application
db.createUser({
  user: 'dren_user',
  pwd: 'dren_password',
  roles: [
    {
      role: 'readWrite',
      db: 'dren_test',
    },
  ],
});

print('MongoDB initialization completed successfully!');
print('Note: Dren library will automatically create indexes and collections when initialized.');
