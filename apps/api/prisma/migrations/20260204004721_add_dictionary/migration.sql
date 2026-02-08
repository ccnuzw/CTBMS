-- CreateTable
CREATE TABLE "DictionaryDomain" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictionaryDomain_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DictionaryItem" (
    "id" TEXT NOT NULL,
    "domainCode" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "parentCode" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DictionaryItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryDomain_code_key" ON "DictionaryDomain"("code");

-- CreateIndex
CREATE INDEX "DictionaryItem_domainCode_idx" ON "DictionaryItem"("domainCode");

-- CreateIndex
CREATE UNIQUE INDEX "DictionaryItem_domainCode_code_key" ON "DictionaryItem"("domainCode", "code");

-- AddForeignKey
ALTER TABLE "DictionaryItem" ADD CONSTRAINT "DictionaryItem_domainCode_fkey" FOREIGN KEY ("domainCode") REFERENCES "DictionaryDomain"("code") ON DELETE CASCADE ON UPDATE CASCADE;
