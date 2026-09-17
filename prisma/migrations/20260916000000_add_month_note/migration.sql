-- CreateTable
CREATE TABLE "MonthNote" (
    "id" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "monthStart" TEXT NOT NULL,
    "monthEnd" TEXT,
    "note" TEXT NOT NULL,

    CONSTRAINT "MonthNote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MonthNote_monthStart_idx" ON "MonthNote"("monthStart");
