-- AlterTable
ALTER TABLE "Campaign" ADD COLUMN     "imageStatus" TEXT,
ADD COLUMN     "imagesDone" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "imagesTotal" INTEGER NOT NULL DEFAULT 0;

