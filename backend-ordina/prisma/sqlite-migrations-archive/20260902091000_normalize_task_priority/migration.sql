-- Normalize legacy task priority labels before Prisma reads the integer column.
UPDATE "tasks"
SET "priority" = CASE LOWER(CAST("priority" AS TEXT))
  WHEN 'low' THEN 1
  WHEN 'medium' THEN 2
  WHEN 'high' THEN 3
  ELSE CAST("priority" AS INTEGER)
END
WHERE LOWER(CAST("priority" AS TEXT)) IN ('low', 'medium', 'high');
