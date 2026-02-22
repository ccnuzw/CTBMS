import { Prisma } from '@prisma/client';
import { IntelTaskQuery } from '@packages/types';

export function isMissingReturnReasonColumnError(error: unknown) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError)) return false;
    if (error.code !== 'P2022') return false;
    const column = String((error.meta as { column?: unknown } | undefined)?.column || '');
    const message = String(error.message || '');
    const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
    return normalize(column).includes('returnreason') || normalize(message).includes('returnreason');
}

export function buildIntelTaskWhere(
    query: Partial<IntelTaskQuery> & Record<string, unknown>,
    _mode: 'list' | 'metrics',
): Prisma.IntelTaskWhereInput {
    const {
        assigneeId, assigneeOrgId, assigneeDeptId,
        createdById, templateId, ruleId, taskGroupId, collectionPointId,
        type, status, priority, commodity, isLate, keyword,
    } = query;

    const where: Prisma.IntelTaskWhereInput = {};

    if (assigneeId) where.assigneeId = assigneeId;
    if (assigneeOrgId) where.assigneeOrgId = assigneeOrgId;
    if (assigneeDeptId) where.assigneeDeptId = assigneeDeptId;
    if (createdById) where.createdById = createdById;
    if (templateId) where.templateId = templateId;
    if (ruleId) where.ruleId = ruleId;
    if (taskGroupId) where.taskGroupId = taskGroupId;
    if (collectionPointId) where.collectionPointId = collectionPointId;
    if (type) where.type = type;
    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (commodity) where.commodity = commodity;
    if (isLate !== undefined) where.isLate = isLate === 'true' || isLate === true;

    const keywordValue = typeof keyword === 'string' ? keyword : undefined;
    if (keywordValue) {
        where.OR = [
            { title: { contains: keywordValue, mode: 'insensitive' } },
            { description: { contains: keywordValue, mode: 'insensitive' } },
        ];
    }
    return where;
}
