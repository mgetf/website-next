-- CreateTable
CREATE TABLE "match_logs" (
    "id" SERIAL NOT NULL,
    "mge_match_id" TEXT NOT NULL,
    "raw_log_key" TEXT NOT NULL,
    "parsed_data" JSONB NOT NULL,
    "hostname" TEXT,
    "map" TEXT NOT NULL,
    "arena" TEXT,
    "gamemode" TEXT NOT NULL,
    "format" TEXT NOT NULL,
    "aborted" BOOLEAN NOT NULL DEFAULT false,
    "started_at" TIMESTAMP(3),
    "ended_at" TIMESTAMP(3),
    "duration_sec" INTEGER,
    "uploaded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "match_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "match_logs_mge_match_id_key" ON "match_logs"("mge_match_id");
