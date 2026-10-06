-- CreateTable
CREATE TABLE "GoalDay" (
    "id" TEXT NOT NULL,
    "goalId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" "GoalStatus" NOT NULL,
    "actual" DOUBLE PRECISION,

    CONSTRAINT "GoalDay_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GoalDay_date_idx" ON "GoalDay"("date");

-- CreateIndex
CREATE UNIQUE INDEX "GoalDay_goalId_date_key" ON "GoalDay"("goalId", "date");

-- AddForeignKey
ALTER TABLE "GoalDay" ADD CONSTRAINT "GoalDay_goalId_fkey" FOREIGN KEY ("goalId") REFERENCES "Goal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

