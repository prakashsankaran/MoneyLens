-- AlterTable
ALTER TABLE "FinancialProfile" ADD COLUMN     "emergencyFundCurrent" DECIMAL(14,2);

-- CreateIndex
CREATE INDEX "Budget_userId_month_idx" ON "Budget"("userId", "month");

