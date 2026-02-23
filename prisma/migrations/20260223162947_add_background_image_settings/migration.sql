-- AlterTable
ALTER TABLE "site_settings" ADD COLUMN     "background_blur" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "background_brightness" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "background_image_path" TEXT,
ADD COLUMN     "background_overlay" DOUBLE PRECISION NOT NULL DEFAULT 0.85;
