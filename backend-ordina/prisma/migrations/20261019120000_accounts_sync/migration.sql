-- Version 2: refresh-token sessions, server backup/sync of tasks and categories, and a limit on
-- password-reset code attempts. Additive only: no existing table or column is changed or dropped.

ALTER TABLE "password_resets" ADD COLUMN "attempts" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "refresh_tokens" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "sync_items" (
    "user_id" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "data" TEXT,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "seq" BIGSERIAL NOT NULL,
    CONSTRAINT "sync_items_pkey" PRIMARY KEY ("user_id","kind","item_id")
);
CREATE INDEX "sync_items_user_id_seq_idx" ON "sync_items"("user_id", "seq");
ALTER TABLE "sync_items" ADD CONSTRAINT "sync_items_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
