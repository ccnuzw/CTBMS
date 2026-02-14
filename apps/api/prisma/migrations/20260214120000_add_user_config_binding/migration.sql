-- CreateTable
CREATE TABLE "UserConfigBinding" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "bindingType" VARCHAR(50) NOT NULL,
    "targetId" TEXT NOT NULL,
    "targetCode" VARCHAR(100),
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserConfigBinding_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserConfigBinding_userId_bindingType_targetId_key" ON "UserConfigBinding"("userId", "bindingType", "targetId");

-- CreateIndex
CREATE INDEX "UserConfigBinding_userId_bindingType_isActive_idx" ON "UserConfigBinding"("userId", "bindingType", "isActive");

-- CreateIndex
CREATE INDEX "UserConfigBinding_bindingType_targetId_idx" ON "UserConfigBinding"("bindingType", "targetId");

-- AddForeignKey
ALTER TABLE "UserConfigBinding" ADD CONSTRAINT "UserConfigBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
