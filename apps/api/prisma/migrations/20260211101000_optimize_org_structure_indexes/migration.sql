-- Organization structure performance indexes
CREATE INDEX IF NOT EXISTS "User_organizationId_idx" ON "User"("organizationId");
CREATE INDEX IF NOT EXISTS "User_departmentId_idx" ON "User"("departmentId");
CREATE INDEX IF NOT EXISTS "User_organizationId_departmentId_idx" ON "User"("organizationId", "departmentId");

CREATE INDEX IF NOT EXISTS "Organization_parentId_idx" ON "Organization"("parentId");

CREATE INDEX IF NOT EXISTS "Department_organizationId_idx" ON "Department"("organizationId");
CREATE INDEX IF NOT EXISTS "Department_parentId_idx" ON "Department"("parentId");
