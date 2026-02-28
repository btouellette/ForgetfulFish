-- AlterTable
ALTER TABLE "games"
ADD COLUMN "state" JSONB NOT NULL,
ADD COLUMN "stateVersion" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN "last_applied_event_seq" INTEGER NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "game_events" (
    "id" TEXT NOT NULL,
    "gameId" UUID NOT NULL,
    "seq" INTEGER NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "caused_by_user_id" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "game_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "game_events_gameId_seq_key" ON "game_events"("gameId", "seq");

-- CreateIndex
CREATE INDEX "game_events_gameId_createdAt_idx" ON "game_events"("gameId", "createdAt");

-- CreateIndex
CREATE INDEX "game_events_caused_by_user_id_idx" ON "game_events"("caused_by_user_id");

-- AddForeignKey
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "game_events" ADD CONSTRAINT "game_events_caused_by_user_id_fkey" FOREIGN KEY ("caused_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
