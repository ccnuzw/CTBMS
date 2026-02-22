import { PrismaClient, KnowledgeStatus, KnowledgeType, KnowledgeContentFormat, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const mapReviewStatus = (status: string): KnowledgeStatus => {
    switch (status) {
        case 'PENDING':
            return KnowledgeStatus.PENDING_REVIEW;
        case 'APPROVED':
            return KnowledgeStatus.PUBLISHED;
        case 'REJECTED':
            return KnowledgeStatus.REJECTED;
        case 'ARCHIVED':
            return KnowledgeStatus.ARCHIVED;
        default:
            return KnowledgeStatus.DRAFT;
    }
};

async function main() {
    console.log('开始同步 ResearchReport 数据到 KnowledgeItem 体系...');

    // 1. 查找所有带有 intel 的 ResearchReport 记录
    const reports = await prisma.researchReport.findMany({
        include: {
            intel: {
                include: {
                    attachments: true,
                },
            },
        },
    });

    console.log(`共找到 ${reports.length} 条 ResearchReport 记录。`);

    let updatedCount = 0;
    let createdCount = 0;

    for (const report of reports) {
        if (!report.intelId || !report.intel) {
            console.warn(`研报 ${report.id} 缺少关联的 MarketIntel，跳过...`);
            continue;
        }

        const intel = report.intel;

        // 2. 检查对应的 KnowledgeItem 是否已存在（之前是否有其他同步方式创建过）
        const existingKnowledge = await prisma.knowledgeItem.findFirst({
            where: {
                originLegacyType: 'MARKET_INTEL',
                originLegacyId: intel.id,
            },
        });

        if (existingKnowledge) {
            // 已经存在，只更新统计数据和状态
            await prisma.knowledgeItem.update({
                where: { id: existingKnowledge.id },
                data: {
                    viewCount: report.viewCount,
                    downloadCount: report.downloadCount,
                    status: mapReviewStatus(report.reviewStatus),
                    publishAt: report.publishDate || intel.effectiveTime || intel.createdAt,
                    region: report.regions,
                    commodities: report.commodities,
                    title: report.title,
                    contentPlain: intel.rawContent || report.summary || '',
                    sourceType: report.source || '未知来源',
                    updatedAt: new Date(),
                },
            });

            // 确保 KnowledgeAnalysis 存在并更新
            const analysisExists = await prisma.knowledgeAnalysis.findUnique({
                where: { knowledgeId: existingKnowledge.id },
            });

            const analysisData = {
                summary: report.summary,
                reportType: report.reportType,
                reportPeriod: report.reportPeriod || undefined,
                keyPoints: report.keyPoints ? (report.keyPoints as Prisma.InputJsonValue) : Prisma.JsonNull,
                prediction: report.prediction ? (report.prediction as Prisma.InputJsonValue) : Prisma.JsonNull,
                dataPoints: report.dataPoints ? (report.dataPoints as Prisma.InputJsonValue) : Prisma.JsonNull,
            };

            if (analysisExists) {
                await prisma.knowledgeAnalysis.update({
                    where: { knowledgeId: existingKnowledge.id },
                    data: analysisData,
                });
            } else {
                await prisma.knowledgeAnalysis.create({
                    data: {
                        ...analysisData,
                        knowledgeId: existingKnowledge.id,
                    },
                });
            }

            updatedCount++;
            console.log(`更新已存在的 KnowledgeItem: ${existingKnowledge.id} (来源于 Report ${report.id})`);
        } else {
            // 不存在，创建新的 KnowledgeItem 和相关记录
            const newKnowledge = await prisma.$transaction(async (tx) => {
                const ki = await tx.knowledgeItem.create({
                    data: {
                        type: KnowledgeType.RESEARCH,
                        title: report.title,
                        contentFormat: KnowledgeContentFormat.MARKDOWN,
                        contentPlain: intel.rawContent || report.summary || '',
                        contentRich: intel.rawContent || report.summary || '', // 默认将普通文本放进富文本
                        sourceType: report.source || '未知来源',
                        publishAt: report.publishDate || intel.effectiveTime || intel.createdAt,
                        region: report.regions,
                        commodities: report.commodities,
                        status: mapReviewStatus(report.reviewStatus),
                        authorId: intel.authorId || 'system',
                        originLegacyType: 'MARKET_INTEL',
                        originLegacyId: intel.id,
                        viewCount: report.viewCount,
                        downloadCount: report.downloadCount,
                        createdAt: report.createdAt,
                        updatedAt: report.updatedAt,
                    },
                });

                // 创建 KnowledgeAnalysis
                await tx.knowledgeAnalysis.create({
                    data: {
                        knowledgeId: ki.id,
                        summary: report.summary,
                        reportType: report.reportType,
                        reportPeriod: report.reportPeriod || undefined,
                        keyPoints: report.keyPoints ? (report.keyPoints as Prisma.InputJsonValue) : Prisma.JsonNull,
                        prediction: report.prediction ? (report.prediction as Prisma.InputJsonValue) : Prisma.JsonNull,
                        dataPoints: report.dataPoints ? (report.dataPoints as Prisma.InputJsonValue) : Prisma.JsonNull,
                    },
                });

                // 迁移附件
                if (intel.attachments && intel.attachments.length > 0) {
                    await tx.knowledgeAttachment.createMany({
                        data: intel.attachments.map((att) => ({
                            knowledgeId: ki.id,
                            filename: att.filename || att.id,
                            mimeType: att.mimeType,
                            fileSize: att.fileSize,
                            storagePath: att.storagePath,
                            createdAt: att.createdAt,
                        })),
                    });
                }

                return ki;
            });

            createdCount++;
            console.log(`新建 KnowledgeItem: ${newKnowledge.id} (来源于 Report ${report.id})`);
        }
    }

    console.log(`\n同步完成！更新了 ${updatedCount} 条，新建了 ${createdCount} 条。`);
}

main()
    .catch((e) => {
        console.error('同步过程中发生错误：', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
