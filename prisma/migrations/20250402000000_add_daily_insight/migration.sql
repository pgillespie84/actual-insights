-- CreateTable
CREATE TABLE "DailyInsight" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "content" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,

    CONSTRAINT "DailyInsight_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DailyInsight_monthKey_idx" ON "DailyInsight"("monthKey");
