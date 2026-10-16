-- ORDINA AI planning: per-user planning profile, duplicate-save protection, task deadlines.
-- New tables only (IF NOT EXISTS), so this is safe whether or not ensure-schema ran first.

CREATE TABLE IF NOT EXISTS "planning_profiles" (
    "user_id" INTEGER NOT NULL PRIMARY KEY,
    "data" TEXT NOT NULL,
    "updated_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "planning_profiles_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ai_plan_confirmations" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "response" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_plan_confirmations_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ai_plan_confirmations_user_id_idempotency_key_key" ON "ai_plan_confirmations"("user_id", "idempotency_key");

CREATE TABLE IF NOT EXISTS "task_deadlines" (
    "task_id" INTEGER NOT NULL PRIMARY KEY,
    "deadline" TEXT NOT NULL,
    CONSTRAINT "task_deadlines_task_id_fkey" FOREIGN KEY ("task_id") REFERENCES "tasks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
