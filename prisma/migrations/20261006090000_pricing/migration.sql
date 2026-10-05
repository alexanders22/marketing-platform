-- AlterTable
ALTER TABLE "CreditEntry" ADD COLUMN     "action" TEXT,
ADD COLUMN     "units" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

