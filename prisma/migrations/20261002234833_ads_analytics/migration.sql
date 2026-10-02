-- AlterTable
ALTER TABLE "SocialAccount" ADD COLUMN     "syncedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "AdCampaign" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT,
    "status" TEXT NOT NULL,
    "dailyBudget" DOUBLE PRECISION,
    "lifetimeBudget" DOUBLE PRECISION,
    "currency" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AdInsightDay" (
    "id" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "spend" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "results" INTEGER NOT NULL DEFAULT 0,
    "resultType" TEXT,
    "revenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "actions" JSONB,

    CONSTRAINT "AdInsightDay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiSummary" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "periodDays" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AiSummary_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdCampaign_workspaceId_idx" ON "AdCampaign"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "AdCampaign_socialAccountId_externalId_key" ON "AdCampaign"("socialAccountId", "externalId");

-- CreateIndex
CREATE INDEX "AdInsightDay_date_idx" ON "AdInsightDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "AdInsightDay_campaignId_date_key" ON "AdInsightDay"("campaignId", "date");

-- CreateIndex
CREATE INDEX "AiSummary_workspaceId_createdAt_idx" ON "AiSummary"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdCampaign" ADD CONSTRAINT "AdCampaign_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdInsightDay" ADD CONSTRAINT "AdInsightDay_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "AdCampaign"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiSummary" ADD CONSTRAINT "AiSummary_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

