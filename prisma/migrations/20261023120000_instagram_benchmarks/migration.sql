-- CreateTable
CREATE TABLE "InstagramBenchmark" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "competitorId" TEXT,
    "username" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT,
    "avatarUrl" TEXT,
    "followers" INTEGER,
    "mediaCount" INTEGER,
    "posts30" INTEGER,
    "avgLikes" DOUBLE PRECISION,
    "avgComments" DOUBLE PRECISION,
    "error" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InstagramBenchmark_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "InstagramBenchmark_workspaceId_username_date_key" ON "InstagramBenchmark"("workspaceId", "username", "date");

-- CreateIndex
CREATE INDEX "InstagramBenchmark_workspaceId_date_idx" ON "InstagramBenchmark"("workspaceId", "date");

-- AddForeignKey
ALTER TABLE "InstagramBenchmark" ADD CONSTRAINT "InstagramBenchmark_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InstagramBenchmark" ADD CONSTRAINT "InstagramBenchmark_competitorId_fkey" FOREIGN KEY ("competitorId") REFERENCES "Competitor"("id") ON DELETE CASCADE ON UPDATE CASCADE;
