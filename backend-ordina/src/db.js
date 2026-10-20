const fs = require('node:fs');
const path = require('node:path');
const Database = require('better-sqlite3');

const defaultDatabasePath = path.join(__dirname, '..', 'data', 'ordina.sqlite');
const databasePath = process.env.DATABASE_PATH || defaultDatabasePath;
const schemaPath = path.join(__dirname, '..', 'schema.sql');

fs.mkdirSync(path.dirname(databasePath), { recursive: true });

const db = new Database(databasePath);
db.pragma('foreign_keys = ON');

function initializeDatabase() {
  db.exec(fs.readFileSync(schemaPath, 'utf8'));
  return db;
}

function closeDatabase() {
  if (db.open) {
    db.close();
  }
}

module.exports = { db, initializeDatabase, closeDatabase, databasePath };