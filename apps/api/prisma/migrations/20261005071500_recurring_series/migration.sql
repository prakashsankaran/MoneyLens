-- Detected series were never stored before this migration; clear any rows so the
-- new required key can be added. Detection repopulates the table.
DELETE FROM "RecurringPayment";

-- DropIndex
DROP INDEX "RecurringPayment_userId_idx";

-- AlterTable
ALTER TABLE "RecurringPayment" ADD COLUMN     "flow" "TransactionFlow" NOT NULL DEFAULT 'OUT',
ADD COLUMN     "isActive" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "key" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "RecurringPayment_userId_key_key" ON "RecurringPayment"("userId", "key");

