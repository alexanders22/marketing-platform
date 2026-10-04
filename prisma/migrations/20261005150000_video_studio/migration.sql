-- CreateEnum
CREATE TYPE "VideoStatus" AS ENUM ('DRAFT', 'RENDERING', 'READY', 'FAILED');

-- AlterEnum
ALTER TYPE "MediaKind" ADD VALUE 'AUDIO';

-- AlterTable
ALTER TABLE "Media" ADD COLUMN     "durationMs" INTEGER,
ADD COLUMN     "height" INTEGER,
ADD COLUMN     "posterId" TEXT,
ADD COLUMN     "width" INTEGER;

-- CreateTable
CREATE TABLE "Video" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT '9:16',
    "data" JSONB NOT NULL,
    "status" "VideoStatus" NOT NULL DEFAULT 'DRAFT',
    "error" TEXT,
    "outputMediaId" TEXT,
    "renderedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Video_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Video_workspaceId_updatedAt_idx" ON "Video"("workspaceId", "updatedAt");

-- AddForeignKey
ALTER TABLE "Video" ADD CONSTRAINT "Video_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

