-- CreateTable
CREATE TABLE "TelegramCode" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramCode_codeHash_key" ON "TelegramCode"("codeHash");

-- CreateIndex
CREATE INDEX "TelegramCode_workspaceId_target_idx" ON "TelegramCode"("workspaceId", "target");

-- CreateIndex
CREATE INDEX "TelegramCode_expiresAt_idx" ON "TelegramCode"("expiresAt");

-- AddForeignKey
ALTER TABLE "TelegramCode" ADD CONSTRAINT "TelegramCode_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
