async function columnNames(prisma, table) {
  const rows = await prisma.$queryRawUnsafe(`PRAGMA table_info(${table})`);
  return new Set((rows || []).map((row) => row.name));
}

async function addColumn(prisma, table, column, ddl) {
  const columns = await columnNames(prisma, table);
  if (columns.has(column)) return;
  await prisma.$executeRawUnsafe(ddl);
}

async function ensureSchema(prisma) {
  await addColumn(prisma, 'users', 'timezone', "ALTER TABLE users ADD COLUMN timezone TEXT NOT NULL DEFAULT 'UTC'");
  await addColumn(prisma, 'users', 'google_id', 'ALTER TABLE users ADD COLUMN google_id TEXT');
  await addColumn(prisma, 'users', 'apple_id', 'ALTER TABLE users ADD COLUMN apple_id TEXT');
  await addColumn(prisma, 'tasks', 'goal_id', 'ALTER TABLE tasks ADD COLUMN goal_id INTEGER REFERENCES goals(id) ON DELETE SET NULL');
  await addColumn(prisma, 'tasks', 'parent_task_id', 'ALTER TABLE tasks ADD COLUMN parent_task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE');
  await addColumn(prisma, 'tasks', 'start_time', 'ALTER TABLE tasks ADD COLUMN start_time TEXT');
  await addColumn(prisma, 'tasks', 'duration', 'ALTER TABLE tasks ADD COLUMN duration TEXT');
  await addColumn(prisma, 'tasks', 'contact_name', 'ALTER TABLE tasks ADD COLUMN contact_name TEXT');
  await addColumn(prisma, 'tasks', 'contact_phone', 'ALTER TABLE tasks ADD COLUMN contact_phone TEXT');

  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS users_google_id_key ON users(google_id)');
  await prisma.$executeRawUnsafe('CREATE UNIQUE INDEX IF NOT EXISTS users_apple_id_key ON users(apple_id)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS tasks_goal_id_idx ON tasks(goal_id)');
  await prisma.$executeRawUnsafe('CREATE INDEX IF NOT EXISTS tasks_parent_task_id_occurrence_date_idx ON tasks(parent_task_id, occurrence_date)');

  await addColumn(prisma, 'reminders', 'kind', "ALTER TABLE reminders ADD COLUMN kind TEXT NOT NULL DEFAULT 'time'");
  await addColumn(prisma, 'reminders', 'latitude', 'ALTER TABLE reminders ADD COLUMN latitude REAL');
  await addColumn(prisma, 'reminders', 'longitude', 'ALTER TABLE reminders ADD COLUMN longitude REAL');
  await addColumn(prisma, 'reminders', 'radius_meters', 'ALTER TABLE reminders ADD COLUMN radius_meters INTEGER');
  await addColumn(prisma, 'reminders', 'place_name', 'ALTER TABLE reminders ADD COLUMN place_name TEXT');

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS places (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      latitude REAL NOT NULL,
      longitude REAL NOT NULL,
      radius_meters INTEGER NOT NULL DEFAULT 150,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      code_hash TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `);
}

module.exports = { ensureSchema };
