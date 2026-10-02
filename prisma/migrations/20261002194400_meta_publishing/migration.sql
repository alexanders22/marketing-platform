-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('PUBLISHED', 'FAILED');

-- AlterEnum
ALTER TYPE "PostStatus" ADD VALUE 'PUBLISHING';

-- AlterEnum
ALTER TYPE "SocialNetwork" ADD VALUE 'META_ADS';

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "publishedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "connectedBy" TEXT,
ADD COLUMN     "handle" TEXT,
ADD COLUMN     "lastError" TEXT,
ADD COLUMN     "meta" JSONB,
ADD COLUMN     "parentId" TEXT;

-- CreateTable
CREATE TABLE "PostDelivery" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "status" "DeliveryStatus" NOT NULL,
    "externalId" TEXT,
    "permalink" TEXT,
    "error" TEXT,
    "metrics" JSONB,
    "metricsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PostDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MetaDeletion" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "metaUserId" TEXT NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetaDeletion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PostDelivery_socialAccountId_createdAt_idx" ON "PostDelivery"("socialAccountId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PostDelivery_postId_socialAccountId_key" ON "PostDelivery"("postId", "socialAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "MetaDeletion_code_key" ON "MetaDeletion"("code");

-- CreateIndex
CREATE INDEX "Post_status_scheduledAt_idx" ON "Post"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "SocialAccount_connectedBy_idx" ON "SocialAccount"("connectedBy");

-- AddForeignKey
ALTER TABLE "PostDelivery" ADD CONSTRAINT "PostDelivery_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PostDelivery" ADD CONSTRAINT "PostDelivery_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

