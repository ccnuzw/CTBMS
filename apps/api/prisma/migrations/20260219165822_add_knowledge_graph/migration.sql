-- CreateEnum
CREATE TYPE "NodeType" AS ENUM ('COMMODITY', 'REGION', 'ORGANIZATION', 'EVENT', 'FACTOR', 'CONCEPT');

-- CreateEnum
CREATE TYPE "RelationType" AS ENUM ('AFFECTS', 'CAUSES', 'LOCATED_IN', 'BELONGS_TO', 'HAS_RISK', 'MENTIONS');

-- AlterTable
ALTER TABLE "ResearchReport" ADD COLUMN     "structuredAnalysis" JSONB;

-- CreateTable
CREATE TABLE "KnowledgeNode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "NodeType" NOT NULL,
    "code" TEXT,
    "description" TEXT,
    "meta" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "KnowledgeEdge" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "targetId" TEXT NOT NULL,
    "type" "RelationType" NOT NULL,
    "weight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "sourceIntelId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "KnowledgeEdge_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeNode_code_key" ON "KnowledgeNode"("code");

-- CreateIndex
CREATE INDEX "KnowledgeNode_name_idx" ON "KnowledgeNode"("name");

-- CreateIndex
CREATE INDEX "KnowledgeNode_type_idx" ON "KnowledgeNode"("type");

-- CreateIndex
CREATE INDEX "KnowledgeEdge_sourceId_idx" ON "KnowledgeEdge"("sourceId");

-- CreateIndex
CREATE INDEX "KnowledgeEdge_targetId_idx" ON "KnowledgeEdge"("targetId");

-- CreateIndex
CREATE INDEX "KnowledgeEdge_type_idx" ON "KnowledgeEdge"("type");

-- AddForeignKey
ALTER TABLE "KnowledgeEdge" ADD CONSTRAINT "KnowledgeEdge_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "KnowledgeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "KnowledgeEdge" ADD CONSTRAINT "KnowledgeEdge_targetId_fkey" FOREIGN KEY ("targetId") REFERENCES "KnowledgeNode"("id") ON DELETE CASCADE ON UPDATE CASCADE;
