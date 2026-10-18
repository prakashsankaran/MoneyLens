-- AlterTable
ALTER TABLE "User" ADD COLUMN     "monthlySummaryEmail" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "monthlySummarySentFor" TEXT,
ADD COLUMN     "peopleInCategoryId" TEXT,
ADD COLUMN     "peopleOutCategoryId" TEXT;
