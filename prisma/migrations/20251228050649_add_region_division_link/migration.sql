-- AlterTable
ALTER TABLE "divisions" ADD COLUMN     "region_id" INTEGER;

-- AlterTable
ALTER TABLE "regions" ADD COLUMN     "currency_symbol" TEXT NOT NULL DEFAULT '€';

-- AddForeignKey
ALTER TABLE "divisions" ADD CONSTRAINT "divisions_region_id_fkey" FOREIGN KEY ("region_id") REFERENCES "regions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
