const { initializeDatabase, closeDatabase, databasePath } = require('../src/db');

try {
  initializeDatabase();
  console.log(`Database initialized at ${databasePath}`);
} finally {
  closeDatabase();
}