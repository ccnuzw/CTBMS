-- CreateEnum
CREATE TYPE "EnterpriseType" AS ENUM ('SUPPLIER', 'CUSTOMER', 'LOGISTICS', 'GROUP');

-- CreateEnum
CREATE TYPE "ContactRole" AS ENUM ('PROCUREMENT', 'EXECUTION', 'FINANCE', 'MANAGEMENT');

-- CreateTable
CREATE TABLE "Enterprise" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortName" TEXT,
    "taxId" TEXT NOT NULL,
    "types" "EnterpriseType"[],
    "parentId" TEXT,
    "province" TEXT,
    "city" TEXT,
    "address" TEXT,
    "description" TEXT,
    "riskScore" INTEGER NOT NULL DEFAULT 80,
    "status" "EntityStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enterprise_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT,
    "role" "ContactRole" NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "notes" TEXT,
    "enterpriseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "accountName" TEXT NOT NULL,
    "branch" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isWhitelisted" BOOLEAN NOT NULL DEFAULT false,
    "enterpriseId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Enterprise_taxId_key" ON "Enterprise"("taxId");

-- AddForeignKey
ALTER TABLE "Enterprise" ADD CONSTRAINT "Enterprise_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Enterprise"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BankAccount" ADD CONSTRAINT "BankAccount_enterpriseId_fkey" FOREIGN KEY ("enterpriseId") REFERENCES "Enterprise"("id") ON DELETE CASCADE ON UPDATE CASCADE;
