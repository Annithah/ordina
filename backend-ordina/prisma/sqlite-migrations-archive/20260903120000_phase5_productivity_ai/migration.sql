-- Additive Phase 5/6 schema. Skip columns that already exist on this database.

ALTER TABLE "tasks" ADD COLUMN "recurrence" TEXT NOT NULL DEFAULT 'none';
ALTER TABLE "tasks" ADD COLUMN "recurrence_rule" TEXT;
ALTER TABLE "tasks" ADD COLUMN "occurrence_date" TEXT;
ALTER TABLE "tasks" ADD COLUMN "reminder_enabled" BOOLEAN NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "tasks_goal_id_idx" ON "tasks"("goal_id");
CREATE INDEX IF NOT EXISTS "tasks_parent_task_id_occurrence_date_idx" ON "tasks"("parent_task_id", "occurrence_date");

ALTER TABLE "projects" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'medium';
ALTER TABLE "projects" ADD COLUMN "start_date" DATETIME;

ALTER TABLE "goals" ADD COLUMN "project_id" INTEGER REFERENCES "projects"("id") ON DELETE SET NULL;
ALTER TABLE "goals" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'not_started';
ALTER TABLE "goals" ADD COLUMN "priority" TEXT NOT NULL DEFAULT 'medium';

ALTER TABLE "reminders" ADD COLUMN "task_id" INTEGER REFERENCES "tasks"("id") ON DELETE CASCADE;
ALTER TABLE "reminders" ADD COLUMN "project_id" INTEGER REFERENCES "projects"("id") ON DELETE CASCADE;
ALTER TABLE "reminders" ADD COLUMN "goal_id" INTEGER REFERENCES "goals"("id") ON DELETE CASCADE;
ALTER TABLE "reminders" ADD COLUMN "enabled" BOOLEAN NOT NULL DEFAULT 1;
ALTER TABLE "reminders" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'scheduled';

ALTER TABLE "notifications" ADD COLUMN "related_type" TEXT;
ALTER TABLE "notifications" ADD COLUMN "related_id" INTEGER;

CREATE TABLE IF NOT EXISTS "ai_messages" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "user_id" INTEGER NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "actions" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ai_messages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ai_messages_user_id_created_at_idx" ON "ai_messages"("user_id", "created_at");
