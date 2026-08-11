-- CreateTable
CREATE TABLE "AccountBalanceSnapshot" (
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "balance" INTEGER NOT NULL,

    CONSTRAINT "AccountBalanceSnapshot_pkey" PRIMARY KEY ("accountId", "date")
);

-- CreateIndex
CREATE INDEX "AccountBalanceSnapshot_accountId_date_idx" ON "AccountBalanceSnapshot"("accountId", "date");

-- AddForeignKey
ALTER TABLE "AccountBalanceSnapshot" ADD CONSTRAINT "AccountBalanceSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
