-- AlterTable
ALTER TABLE "Video" ADD COLUMN     "renderProgress" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "renderQueuedAt" TIMESTAMP(3),
ADD COLUMN     "renderStartedAt" TIMESTAMP(3);

