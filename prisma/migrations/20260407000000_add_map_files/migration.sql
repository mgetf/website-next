-- CreateTable
CREATE TABLE "map_files" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "bsp_url" TEXT NOT NULL,
    "bsp_size" BIGINT NOT NULL,
    "cfg_url" TEXT NOT NULL,
    "cfg_size" BIGINT NOT NULL,
    "thumbnail_url" TEXT,
    "description" TEXT,
    "uploaded_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "map_files_name_key" ON "map_files"("name");

-- AddForeignKey
ALTER TABLE "map_files" ADD CONSTRAINT "map_files_uploaded_by_fkey" FOREIGN KEY ("uploaded_by") REFERENCES "users"("steam_id") ON DELETE RESTRICT ON UPDATE CASCADE;
