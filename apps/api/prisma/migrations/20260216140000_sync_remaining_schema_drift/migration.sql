-- AddForeignKey
ALTER TABLE "WorkflowPublishAudit" ADD CONSTRAINT "WorkflowPublishAudit_publishedByUserId_fkey" FOREIGN KEY ("publishedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX IF EXISTS "ParameterItem_parameterSetId_paramCode_scopeLevel_scopeValue_ke" RENAME TO "ParameterItem_parameterSetId_paramCode_scopeLevel_scopeValu_key";
