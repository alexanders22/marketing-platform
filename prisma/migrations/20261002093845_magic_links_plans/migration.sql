-- CreateEnum
CREATE TYPE "Plan" AS ENUM ('NONE', 'STARTER', 'TEAM', 'AGENCY');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- AlterTable
ALTER TABLE "Account" ADD COLUMN     "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "plan" "Plan" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "trialEndsAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "BrandKit" ADD COLUMN     "socialLinks" TEXT[];

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "googleId" TEXT;

-- CreateTable
CREATE TABLE "MagicLink" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MagicLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MagicLink_tokenHash_key" ON "MagicLink"("tokenHash");

-- CreateIndex
CREATE INDEX "MagicLink_email_createdAt_idx" ON "MagicLink"("email", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "User_googleId_key" ON "User"("googleId");

