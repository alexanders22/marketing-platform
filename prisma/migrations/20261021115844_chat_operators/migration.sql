-- AlterTable
ALTER TABLE "ChatConversation" ADD COLUMN     "operatorId" TEXT;

-- CreateTable
CREATE TABLE "ChatOperator" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "email" TEXT,
    "telegramChatId" TEXT,
    "telegramName" TEXT,
    "lastAssignedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChatOperator_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatOperator_workspaceId_userId_key" ON "ChatOperator"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "ChatConversation_operatorId_status_idx" ON "ChatConversation"("operatorId", "status");

-- AddForeignKey
ALTER TABLE "ChatConversation" ADD CONSTRAINT "ChatConversation_operatorId_fkey" FOREIGN KEY ("operatorId") REFERENCES "ChatOperator"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatOperator" ADD CONSTRAINT "ChatOperator_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChatOperator" ADD CONSTRAINT "ChatOperator_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
