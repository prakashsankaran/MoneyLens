-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEBIT', 'CREDIT', 'REFUND', 'CASHBACK', 'TRANSFER', 'SELF_TRANSFER', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "TransactionFlow" AS ENUM ('OUT', 'IN');

-- CreateEnum
CREATE TYPE "TransactionSource" AS ENUM ('GOOGLE_PAY', 'CSV', 'XLSX', 'MANUAL', 'OTHER');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('CONFIRMED', 'PENDING_REVIEW', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('UPI', 'CARD', 'NETBANKING', 'CASH', 'WALLET', 'OTHER');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('UPLOADED', 'PARSING', 'READY_FOR_REVIEW', 'CONFIRMED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ImportRowDecision" AS ENUM ('INCLUDE', 'EXCLUDE', 'DUPLICATE');

-- CreateEnum
CREATE TYPE "RecurringFrequency" AS ENUM ('WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY', 'IRREGULAR');

-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('FACT', 'CALCULATION', 'OBSERVATION', 'AI_INTERPRETATION', 'RECOMMENDATION');

-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('INFO', 'LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "AIRole" AS ENUM ('USER', 'ASSISTANT', 'SYSTEM');

-- CreateEnum
CREATE TYPE "RuleMatchField" AS ENUM ('MERCHANT', 'DESCRIPTION', 'UPI_ID');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedBy" TEXT,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "parentId" TEXT,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "icon" TEXT,
    "color" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Merchant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "normalizedName" TEXT NOT NULL,
    "defaultCategoryId" TEXT,
    "userCategoryId" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Merchant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MerchantAlias" (
    "id" TEXT NOT NULL,
    "merchantId" TEXT NOT NULL,
    "alias" TEXT NOT NULL,
    "aliasKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MerchantAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserCategoryRule" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "matchField" "RuleMatchField" NOT NULL,
    "pattern" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCategoryRule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "transactionDate" TIMESTAMPTZ(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "currency" CHAR(3) NOT NULL DEFAULT 'INR',
    "transactionType" "TransactionType" NOT NULL,
    "flow" "TransactionFlow" NOT NULL,
    "merchantId" TEXT,
    "merchantName" TEXT,
    "description" TEXT,
    "categoryId" TEXT,
    "subcategoryId" TEXT,
    "paymentMethod" "PaymentMethod",
    "upiId" TEXT,
    "transactionReference" TEXT,
    "source" "TransactionSource" NOT NULL,
    "sourceFileId" TEXT,
    "status" "TransactionStatus" NOT NULL DEFAULT 'CONFIRMED',
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurringGroupId" TEXT,
    "categoryConfidence" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Import" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "originalFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "storageKey" TEXT,
    "source" "TransactionSource" NOT NULL,
    "parserName" TEXT,
    "status" "ImportStatus" NOT NULL DEFAULT 'UPLOADED',
    "statementStart" DATE,
    "statementEnd" DATE,
    "detectedCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "committedCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "confirmedAt" TIMESTAMP(3),

    CONSTRAINT "Import_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImportTransaction" (
    "id" TEXT NOT NULL,
    "importId" TEXT NOT NULL,
    "rowIndex" INTEGER NOT NULL,
    "transactionDate" TIMESTAMPTZ(3) NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "transactionType" "TransactionType" NOT NULL,
    "flow" "TransactionFlow" NOT NULL,
    "rawDescription" TEXT,
    "merchantName" TEXT,
    "categoryId" TEXT,
    "categoryConfidence" DOUBLE PRECISION,
    "upiId" TEXT,
    "transactionReference" TEXT,
    "decision" "ImportRowDecision" NOT NULL DEFAULT 'INCLUDE',
    "duplicateOfId" TEXT,
    "duplicateReason" TEXT,
    "warnings" JSONB,
    "committedId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ImportTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecurringPayment" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "merchantId" TEXT,
    "label" TEXT NOT NULL,
    "frequency" "RecurringFrequency" NOT NULL,
    "typicalAmount" DECIMAL(14,2) NOT NULL,
    "lastChargedAt" TIMESTAMP(3),
    "nextExpectedAt" TIMESTAMP(3),
    "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isSubscription" BOOLEAN NOT NULL DEFAULT false,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RecurringPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Insight" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" "InsightKind" NOT NULL,
    "severity" "InsightSeverity" NOT NULL,
    "group" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "explanation" TEXT NOT NULL,
    "recommendation" TEXT,
    "metric" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "supportingTransactionIds" TEXT[],
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Insight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Budget" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "month" DATE NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Budget_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialProfile" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthlyIncome" DECIMAL(14,2),
    "fixedExpenses" DECIMAL(14,2),
    "emis" DECIMAL(14,2),
    "insurance" DECIMAL(14,2),
    "investments" DECIMAL(14,2),
    "savingsTarget" DECIMAL(14,2),
    "emergencyFundTarget" DECIMAL(14,2),
    "upcomingExpenses" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinancialProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MoneyPlan" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "inputs" JSONB NOT NULL,
    "allocation" JSONB NOT NULL,
    "schemaVersion" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MoneyPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIConversation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AIConversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIMessage" (
    "id" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "role" "AIRole" NOT NULL,
    "content" TEXT NOT NULL,
    "provider" TEXT,
    "contextRef" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_familyId_idx" ON "Session"("familyId");

-- CreateIndex
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_parentId_slug_key" ON "Category"("userId", "parentId", "slug");

-- CreateIndex
CREATE INDEX "Merchant_userId_idx" ON "Merchant"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Merchant_userId_normalizedName_key" ON "Merchant"("userId", "normalizedName");

-- CreateIndex
CREATE INDEX "MerchantAlias_aliasKey_idx" ON "MerchantAlias"("aliasKey");

-- CreateIndex
CREATE UNIQUE INDEX "MerchantAlias_merchantId_aliasKey_key" ON "MerchantAlias"("merchantId", "aliasKey");

-- CreateIndex
CREATE INDEX "UserCategoryRule_userId_idx" ON "UserCategoryRule"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "UserCategoryRule_userId_matchField_pattern_key" ON "UserCategoryRule"("userId", "matchField", "pattern");

-- CreateIndex
CREATE INDEX "Transaction_userId_transactionDate_idx" ON "Transaction"("userId", "transactionDate");

-- CreateIndex
CREATE INDEX "Transaction_userId_categoryId_idx" ON "Transaction"("userId", "categoryId");

-- CreateIndex
CREATE INDEX "Transaction_userId_merchantId_idx" ON "Transaction"("userId", "merchantId");

-- CreateIndex
CREATE INDEX "Transaction_userId_transactionType_idx" ON "Transaction"("userId", "transactionType");

-- CreateIndex
CREATE INDEX "Transaction_sourceFileId_idx" ON "Transaction"("sourceFileId");

-- CreateIndex
CREATE INDEX "Transaction_userId_transactionReference_idx" ON "Transaction"("userId", "transactionReference");

-- CreateIndex
CREATE INDEX "Import_userId_createdAt_idx" ON "Import"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Import_userId_sha256_idx" ON "Import"("userId", "sha256");

-- CreateIndex
CREATE INDEX "ImportTransaction_importId_idx" ON "ImportTransaction"("importId");

-- CreateIndex
CREATE UNIQUE INDEX "ImportTransaction_importId_rowIndex_key" ON "ImportTransaction"("importId", "rowIndex");

-- CreateIndex
CREATE INDEX "RecurringPayment_userId_idx" ON "RecurringPayment"("userId");

-- CreateIndex
CREATE INDEX "Insight_userId_periodStart_idx" ON "Insight"("userId", "periodStart");

-- CreateIndex
CREATE UNIQUE INDEX "Insight_userId_key_key" ON "Insight"("userId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "Budget_userId_categoryId_month_key" ON "Budget"("userId", "categoryId", "month");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialProfile_userId_key" ON "FinancialProfile"("userId");

-- CreateIndex
CREATE INDEX "MoneyPlan_userId_idx" ON "MoneyPlan"("userId");

-- CreateIndex
CREATE INDEX "AIConversation_userId_updatedAt_idx" ON "AIConversation"("userId", "updatedAt");

-- CreateIndex
CREATE INDEX "AIMessage_conversationId_createdAt_idx" ON "AIMessage"("conversationId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_defaultCategoryId_fkey" FOREIGN KEY ("defaultCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Merchant" ADD CONSTRAINT "Merchant_userCategoryId_fkey" FOREIGN KEY ("userCategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MerchantAlias" ADD CONSTRAINT "MerchantAlias_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCategoryRule" ADD CONSTRAINT "UserCategoryRule_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserCategoryRule" ADD CONSTRAINT "UserCategoryRule_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_subcategoryId_fkey" FOREIGN KEY ("subcategoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_sourceFileId_fkey" FOREIGN KEY ("sourceFileId") REFERENCES "Import"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringGroupId_fkey" FOREIGN KEY ("recurringGroupId") REFERENCES "RecurringPayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Import" ADD CONSTRAINT "Import_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportTransaction" ADD CONSTRAINT "ImportTransaction_importId_fkey" FOREIGN KEY ("importId") REFERENCES "Import"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportTransaction" ADD CONSTRAINT "ImportTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImportTransaction" ADD CONSTRAINT "ImportTransaction_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Transaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPayment" ADD CONSTRAINT "RecurringPayment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringPayment" ADD CONSTRAINT "RecurringPayment_merchantId_fkey" FOREIGN KEY ("merchantId") REFERENCES "Merchant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Insight" ADD CONSTRAINT "Insight_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Budget" ADD CONSTRAINT "Budget_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialProfile" ADD CONSTRAINT "FinancialProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MoneyPlan" ADD CONSTRAINT "MoneyPlan_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIConversation" ADD CONSTRAINT "AIConversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIMessage" ADD CONSTRAINT "AIMessage_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "AIConversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- System categories have userId = NULL, and top-level categories have
-- parentId = NULL. Postgres treats NULLs as distinct in unique constraints,
-- so enforce uniqueness of shared (system) category slugs explicitly.
CREATE UNIQUE INDEX "Category_system_parent_slug_key"
  ON "Category" (COALESCE("parentId", ''), "slug")
  WHERE "userId" IS NULL;

-- Amounts are stored as positive values; direction lives in "flow".
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_amount_positive" CHECK ("amount" > 0);
ALTER TABLE "ImportTransaction" ADD CONSTRAINT "ImportTransaction_amount_positive" CHECK ("amount" > 0);
