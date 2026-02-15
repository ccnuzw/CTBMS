-- CreateTable
CREATE TABLE IF NOT EXISTS "DebateRoundTrace" (
    "id" TEXT NOT NULL,
    "workflowExecutionId" TEXT NOT NULL,
    "nodeExecutionId" TEXT,
    "roundNumber" INTEGER NOT NULL,
    "participantCode" TEXT NOT NULL,
    "participantRole" TEXT NOT NULL,
    "stance" TEXT,
    "confidence" DOUBLE PRECISION,
    "previousConfidence" DOUBLE PRECISION,
    "statementText" TEXT NOT NULL,
    "evidenceRefs" JSONB,
    "challengeTargetCode" TEXT,
    "challengeText" TEXT,
    "responseText" TEXT,
    "keyPoints" JSONB,
    "isJudgement" BOOLEAN NOT NULL DEFAULT false,
    "judgementVerdict" TEXT,
    "judgementReasoning" TEXT,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DebateRoundTrace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DebateRoundTrace_workflowExecutionId_roundNumber_idx"
ON "DebateRoundTrace"("workflowExecutionId", "roundNumber");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DebateRoundTrace_workflowExecutionId_participantCode_idx"
ON "DebateRoundTrace"("workflowExecutionId", "participantCode");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "DebateRoundTrace_nodeExecutionId_idx"
ON "DebateRoundTrace"("nodeExecutionId");
