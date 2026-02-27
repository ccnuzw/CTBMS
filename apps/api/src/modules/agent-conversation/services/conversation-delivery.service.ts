/**
 * ConversationDeliveryService — 投递管理
 *
 * 职责：
 *   - 邮件/钉钉/企微/飞书投递（deliver / deliverEmail）
 *   - 投递配置文件解析
 *   - 投递主题/内容/Webhook 解析
 */
import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
    DeliverConversationDto,
    DeliverConversationEmailDto,
} from '@packages/types';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../prisma';
import { ConversationUtilsService } from './conversation-utils.service';
import { ConversationAssetService } from './conversation-asset.service';

type DeliveryChannel = 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU';
type TemplateCode = 'DEFAULT' | 'MORNING_BRIEF' | 'WEEKLY_REVIEW' | 'RISK_ALERT';

@Injectable()
export class ConversationDeliveryService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly utils: ConversationUtilsService,
        private readonly assetService: ConversationAssetService,
    ) { }

    async deliverEmail(userId: string, sessionId: string, dto: DeliverConversationEmailDto) {
        return this.deliver(userId, sessionId, {
            exportTaskId: dto.exportTaskId,
            channel: 'EMAIL',
            to: dto.to,
            subject: dto.subject,
            content: dto.content,
            templateCode: 'DEFAULT',
            sendRawFile: true,
        });
    }

    async deliver(userId: string, sessionId: string, dto: DeliverConversationDto) {
        const session = await this.prisma.conversationSession.findFirst({
            where: { id: sessionId, ownerUserId: userId },
        });
        if (!session) return null;

        const exportTask = await this.prisma.exportTask.findFirst({
            where: { id: dto.exportTaskId, createdByUserId: userId },
        });
        if (!exportTask) {
            throw new BadRequestException({
                code: 'CONV_EXPORT_TASK_NOT_FOUND',
                message: '导出任务不存在或无权限访问',
            });
        }
        if (exportTask.status !== 'COMPLETED') {
            throw new BadRequestException({
                code: 'CONV_EXPORT_TASK_NOT_READY',
                message: '导出任务尚未完成，暂不可发送邮件',
            });
        }

        const channel = dto.channel as DeliveryChannel;
        const profileDefaults = await this.resolveDeliveryProfileDefaults(userId, channel);
        const to = channel === 'EMAIL' ? this.mergeDeliveryRecipients(dto.to, profileDefaults.to) : undefined;
        const target = channel === 'EMAIL'
            ? undefined
            : dto.target?.trim() || profileDefaults.target?.trim() || undefined;
        const normalizedTemplate = this.normalizeDeliveryTemplateCode(
            dto.templateCode ?? profileDefaults.templateCode,
        );
        const sendRawFile = dto.sendRawFile ?? profileDefaults.sendRawFile ?? true;

        if (channel === 'EMAIL' && (!to || to.length === 0)) {
            throw new BadRequestException({
                code: 'CONV_DELIVERY_TARGET_REQUIRED',
                message: '邮件投递至少需要一个收件人',
            });
        }
        if (channel !== 'EMAIL' && !target) {
            throw new BadRequestException({
                code: 'CONV_DELIVERY_TARGET_REQUIRED',
                message: '请提供投递目标（群ID或接收端标识）',
            });
        }

        const deliveryTaskId = `delivery_${randomUUID()}`;
        const webhookUrl = this.resolveDeliveryWebhook(channel);
        const subject = this.resolveDeliverySubject(channel, normalizedTemplate, dto.subject);
        const content = this.resolveDeliveryContent(channel, normalizedTemplate, dto.content);

        let status: 'QUEUED' | 'SENT' | 'FAILED' = 'QUEUED';
        let errorMessage: string | null = null;

        if (!webhookUrl) {
            status = 'FAILED';
            errorMessage = `未配置 ${channel} 投递 webhook，无法实际投递`;
        } else {
            try {
                const fileName = `report-export-${exportTask.id}.${String(exportTask.format).toLowerCase()}`;
                const downloadUrl = `/report-exports/${exportTask.id}/download`;
                const response = await fetch(webhookUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        deliveryTaskId, channel, exportTaskId: exportTask.id,
                        to, target, subject, content, templateCode: normalizedTemplate,
                        metadata: dto.metadata,
                        attachment: { fileName, downloadUrl, mode: sendRawFile ? 'RAW_FILE' : 'EXPORT_FILE' },
                    }),
                });
                if (response.ok) {
                    status = 'SENT';
                } else {
                    status = 'FAILED';
                    errorMessage = `${channel} 投递网关返回 ${response.status}`;
                }
            } catch (error) {
                status = 'FAILED';
                errorMessage = error instanceof Error ? error.message : String(error);
            }
        }

        await this.prisma.conversationTurn.create({
            data: {
                sessionId,
                role: 'ASSISTANT',
                content: status === 'SENT'
                    ? `${this.channelDisplayName(channel)} 投递已发送。`
                    : `${this.channelDisplayName(channel)} 投递失败：${errorMessage ?? '未知错误'}。`,
                structuredPayload: {
                    deliveryTaskId, channel, exportTaskId: exportTask.id, status,
                    to, target, subject, templateCode: normalizedTemplate, errorMessage,
                } as Prisma.InputJsonValue,
            },
        });

        await this.assetService.createAsset({
            sessionId,
            assetType: 'NOTE',
            title: `${this.channelDisplayName(channel)}投递${status === 'SENT' ? '成功' : '失败'}`,
            payload: {
                deliveryTaskId, channel, exportTaskId: exportTask.id, status,
                to, target, subject, templateCode: normalizedTemplate, errorMessage,
            },
            sourceExecutionId: exportTask.workflowExecutionId,
        });

        return { deliveryTaskId, channel, status, errorMessage };
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    channelDisplayName(channel: DeliveryChannel) {
        const map: Record<DeliveryChannel, string> = {
            EMAIL: '邮件', DINGTALK: '钉钉', WECOM: '企业微信', FEISHU: '飞书',
        };
        return map[channel] ?? channel;
    }

    normalizeDeliveryTemplateCode(templateCode: unknown): TemplateCode {
        if (templateCode === 'MORNING_BRIEF') return 'MORNING_BRIEF';
        if (templateCode === 'WEEKLY_REVIEW') return 'WEEKLY_REVIEW';
        if (templateCode === 'RISK_ALERT') return 'RISK_ALERT';
        return 'DEFAULT';
    }

    private resolveDeliverySubject(
        channel: DeliveryChannel,
        templateCode: TemplateCode,
        customSubject?: string,
    ) {
        if (customSubject?.trim()) return customSubject.trim();
        const channelName = this.channelDisplayName(channel);
        if (templateCode === 'MORNING_BRIEF') return `${channelName}晨报 - CTBMS 对话助手`;
        if (templateCode === 'WEEKLY_REVIEW') return `${channelName}周复盘 - CTBMS 对话助手`;
        if (templateCode === 'RISK_ALERT') return `${channelName}风险提示 - CTBMS 对话助手`;
        return 'CTBMS 对话助手分析报告';
    }

    private resolveDeliveryContent(
        channel: DeliveryChannel,
        templateCode: TemplateCode,
        customContent?: string,
    ) {
        if (customContent?.trim()) return customContent.trim();
        const channelName = this.channelDisplayName(channel);
        if (templateCode === 'MORNING_BRIEF') return `${channelName}晨报已生成，请查收附件原文件与摘要。`;
        if (templateCode === 'WEEKLY_REVIEW') return `${channelName}周度复盘已生成，请查收本周关键结论和风险提示。`;
        if (templateCode === 'RISK_ALERT') return `${channelName}风险告警已触发，请优先查看风险暴露与应对建议。`;
        return '请查收本次对话分析结果。';
    }

    private resolveDeliveryWebhook(channel: DeliveryChannel) {
        const map: Record<DeliveryChannel, string | undefined> = {
            EMAIL: process.env.MAIL_DELIVERY_WEBHOOK_URL?.trim(),
            DINGTALK: process.env.DINGTALK_DELIVERY_WEBHOOK_URL?.trim(),
            WECOM: process.env.WECOM_DELIVERY_WEBHOOK_URL?.trim(),
            FEISHU: process.env.FEISHU_DELIVERY_WEBHOOK_URL?.trim(),
        };
        return map[channel] ?? null;
    }

    private mergeDeliveryRecipients(primary?: string[], fallback?: string[]): string[] {
        const merged = [...(primary ?? []), ...(fallback ?? [])]
            .map((item) => item.trim())
            .filter(Boolean);
        return merged.filter((item, index) => merged.indexOf(item) === index);
    }

    private async resolveDeliveryProfileDefaults(
        userId: string,
        channel: DeliveryChannel,
    ): Promise<{
        to?: string[];
        target?: string;
        templateCode?: TemplateCode;
        sendRawFile?: boolean;
    }> {
        const bindings = await this.prisma.userConfigBinding.findMany({
            where: { userId, bindingType: 'AGENT_COPILOT_DELIVERY_PROFILES', isActive: true },
            orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
            take: 10,
            select: { metadata: true },
        });

        for (const binding of bindings) {
            const metadata = this.utils.toRecord(binding.metadata);
            const rawProfiles = metadata.profiles;
            if (!Array.isArray(rawProfiles)) continue;

            const profiles = rawProfiles.map((item) => this.utils.toRecord(item));
            const channelProfiles = profiles.filter(
                (profile) => this.utils.pickString(profile.channel) === channel,
            );
            if (!channelProfiles.length) continue;

            const selected =
                channelProfiles.find((profile) => Boolean(profile.isDefault)) ?? channelProfiles[0] ?? null;
            if (!selected) continue;

            const to = Array.isArray(selected.to)
                ? selected.to.map((item) => this.utils.pickString(item)).filter((item): item is string => Boolean(item))
                : undefined;
            const rawTemplateCode = this.utils.pickString(selected.templateCode);

            return {
                to,
                target: this.utils.pickString(selected.target) ?? undefined,
                templateCode: rawTemplateCode ? this.normalizeDeliveryTemplateCode(rawTemplateCode) : undefined,
                sendRawFile: typeof selected.sendRawFile === 'boolean' ? selected.sendRawFile : undefined,
            };
        }
        return {};
    }
}
