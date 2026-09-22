-- CreateTable
CREATE TABLE "SavingsFund" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "group" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedFrom" TEXT,

    CONSTRAINT "SavingsFund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavingsFundBalance" (
    "fundId" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "balance" INTEGER NOT NULL,

    CONSTRAINT "SavingsFundBalance_pkey" PRIMARY KEY ("fundId","monthKey")
);

-- CreateIndex
CREATE UNIQUE INDEX "SavingsFund_name_key" ON "SavingsFund"("name");

-- CreateIndex
CREATE INDEX "SavingsFund_group_idx" ON "SavingsFund"("group");

-- CreateIndex
CREATE INDEX "SavingsFundBalance_monthKey_idx" ON "SavingsFundBalance"("monthKey");

-- AddForeignKey
ALTER TABLE "SavingsFundBalance" ADD CONSTRAINT "SavingsFundBalance_fundId_fkey" FOREIGN KEY ("fundId") REFERENCES "SavingsFund"("id") ON DELETE CASCADE ON UPDATE CASCADE;
