-- CreateEnum
CREATE TYPE "ClipStatus" AS ENUM ('PENDING', 'DONE', 'FAILED');

-- CreateTable
CREATE TABLE "ClipJob" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "videoId" TEXT,
    "sceneId" TEXT,
    "prompt" TEXT NOT NULL,
    "imageId" TEXT,
    "quality" TEXT NOT NULL,
    "aspect" TEXT NOT NULL,
    "seconds" INTEGER NOT NULL,
    "credits" INTEGER NOT NULL,
    "operation" TEXT,
    "status" "ClipStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "mediaId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClipJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClipJob_status_updatedAt_idx" ON "ClipJob"("status", "updatedAt");

-- CreateIndex
CREATE INDEX "ClipJob_workspaceId_createdAt_idx" ON "ClipJob"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "ClipJob" ADD CONSTRAINT "ClipJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

