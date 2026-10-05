CREATE TABLE "profiling_cache" (
    "steam_id" TEXT NOT NULL,
    "snapshot" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiling_cache_pkey" PRIMARY KEY ("steam_id")
);
