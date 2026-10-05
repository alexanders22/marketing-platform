-- AlterEnum
ALTER TYPE "SocialNetwork" ADD VALUE 'GOOGLE_ANALYTICS';

-- CreateTable
CREATE TABLE "WebsiteDay" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "sessions" INTEGER NOT NULL DEFAULT 0,
    "users" INTEGER NOT NULL DEFAULT 0,
    "newUsers" INTEGER NOT NULL DEFAULT 0,
    "engaged" INTEGER NOT NULL DEFAULT 0,
    "keyEvents" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "channels" JSONB NOT NULL DEFAULT '[]',
    "events" JSONB NOT NULL DEFAULT '{}',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebsiteDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WebsiteDay_workspaceId_date_idx" ON "WebsiteDay"("workspaceId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "WebsiteDay_accountId_date_key" ON "WebsiteDay"("accountId", "date");

-- AddForeignKey
ALTER TABLE "WebsiteDay" ADD CONSTRAINT "WebsiteDay_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebsiteDay" ADD CONSTRAINT "WebsiteDay_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

