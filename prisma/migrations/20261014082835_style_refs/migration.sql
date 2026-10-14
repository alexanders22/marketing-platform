-- CreateTable
CREATE TABLE "StyleRef" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "thumbId" TEXT,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StyleRef_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "StyleRef_workspaceId_createdAt_idx" ON "StyleRef"("workspaceId", "createdAt");

-- AddForeignKey
ALTER TABLE "StyleRef" ADD CONSTRAINT "StyleRef_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

