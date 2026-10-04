-- Singleton row for staff-calibrated profiling weights and thresholds.

CREATE TABLE "profiling_settings" (
    "id" INTEGER NOT NULL,
    "weights" JSONB NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profiling_settings_pkey" PRIMARY KEY ("id")
);
