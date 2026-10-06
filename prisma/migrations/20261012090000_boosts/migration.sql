-- CreateTable
CREATE TABLE "Boost" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "deliveryId" TEXT NOT NULL,
    "adAccountId" TEXT NOT NULL,
    "goal" TEXT NOT NULL,
    "dailyBudget" DOUBLE PRECISION NOT NULL,
    "currency" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "audience" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "campaignExternalId" TEXT,
    "adSetExternalId" TEXT,
    "adExternalId" TEXT,
    "adCampaignId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Boost_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Boost_deliveryId_idx" ON "Boost"("deliveryId");

-- CreateIndex
CREATE INDEX "Boost_workspaceId_createdAt_idx" ON "Boost"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_deliveryId_fkey" FOREIGN KEY ("deliveryId") REFERENCES "PostDelivery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_adAccountId_fkey" FOREIGN KEY ("adAccountId") REFERENCES "SocialAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Boost" ADD CONSTRAINT "Boost_adCampaignId_fkey" FOREIGN KEY ("adCampaignId") REFERENCES "AdCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

