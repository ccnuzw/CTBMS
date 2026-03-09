/**
 * ConversationDeliveryService — 推送投递领域
 *
 * 负责：
 *   - deliver: 多渠道投递（EMAIL, DINGTALK, WECOM, FEISHU）
 *   - deliverEmail: 邮件投递快捷方法
 *   - 模板解析、收件人合并、投递日志记录
 *   - 投递配置绑定管理（CRUD）
 *
 * 渠道实现:
 *   - EMAIL: nodemailer SMTP 直发（需 SMTP_HOST/PORT/USER/PASS/FROM 环境变量）
 *   - WECOM: 企微机器人 Webhook 直调（Markdown 卡片）
 *   - DINGTALK/FEISHU: 通用 Webhook 代理
 */
import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import * as nodemailer from 'nodemailer';
import { PrismaService } from '../../../prisma';
import { ConversationUtilsService } from './conversation-utils.service';
import { ConversationAssetService } from './conversation-asset.service';
import type {
    DeliverConversationDto,
    DeliverConversationEmailDto,
} from '@packages/types';

type DeliveryChannel = 'EMAIL' | 'DINGTALK' | 'WECOM' | 'FEISHU';
type DeliveryTemplateCode = 'DEFAULT' | 'MORNING_BRIEF' | 'WEEKLY_REVIEW' | 'RISK_ALERT';

const MAX_DELIVERY_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 1000;

/** 渠道发送结果 */
interface ChannelSendResult {
    status: 'SENT' | 'FAILED';
    errorMessage: string | null;
    /** 实际使用的投递方式 */
    deliveryMethod: 'SMTP' | 'WECOM_WEBHOOK' | 'GENERIC_WEBHOOK';
    /** 实际重试次数 */
    retryCount?: number;
}

@Injectable()
export class ConversationDeliveryService {
    private readonly logger = new Logger(ConversationDeliveryService.name);

    constructor(
        private readonly prisma: PrismaService,
        private readonly utilsService: ConversationUtilsService,
        private readonly assetService: ConversationAssetService,
    ) { }

    // ── Public API ───────────────────────────────────────────────────────────

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
        if (!session) {
            return null;
        }

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

        const channel = dto.channel;
        const profileDefaults = await this.resolveDeliveryProfileDefaults(userId, channel);
        const to =
            channel === 'EMAIL' ? this.mergeDeliveryRecipients(dto.to, profileDefaults.to) : undefined;
        const target =
            channel === 'EMAIL'
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
        const subject = this.resolveDeliverySubject(channel, normalizedTemplate, dto.subject);
        const content = this.resolveDeliveryContent(channel, normalizedTemplate, dto.content);
        const fileName = `report-export-${exportTask.id}.${String(exportTask.format).toLowerCase()}`;
        const downloadUrl = `/report-exports/${exportTask.id}/download`;

        // ── 按渠道分发（含重试） ────────────────────────────────────────
        const sendOnce = async (): Promise<ChannelSendResult> => {
            switch (channel) {
                case 'EMAIL':
                    return this.sendViaSmtp({
                        to: to ?? [],
                        subject,
                        content,
                        fileName,
                        downloadUrl,
                        sendRawFile,
                    });

                case 'WECOM':
                    return this.sendViaWecomWebhook({
                        target: target ?? '',
                        subject,
                        content,
                        fileName,
                        downloadUrl,
                    });

                default:
                    // DINGTALK / FEISHU — 通用 Webhook 代理
                    return this.sendViaGenericWebhook({
                        channel,
                        deliveryTaskId,
                        exportTaskId: exportTask.id,
                        to,
                        target,
                        subject,
                        content,
                        templateCode: normalizedTemplate,
                        metadata: dto.metadata,
                        fileName,
                        downloadUrl,
                        sendRawFile,
                    });
            }
        };

        const result = await this.sendWithRetry(sendOnce);

        const { status, errorMessage, deliveryMethod, retryCount } = result;

        // ── 投递日志持久化 ──────────────────────────────────────────────
        await this.prisma.conversationTurn.create({
            data: {
                sessionId,
                role: 'ASSISTANT',
                content:
                    status === 'SENT'
                        ? `${this.channelDisplayName(channel)} 投递已发送。`
                        : `${this.channelDisplayName(channel)} 投递失败：${errorMessage ?? '未知错误'}。`,
                structuredPayload: {
                    deliveryTaskId,
                    channel,
                    exportTaskId: exportTask.id,
                    status,
                    deliveryMethod,
                    retryCount: retryCount ?? 0,
                    to,
                    target,
                    subject,
                    templateCode: normalizedTemplate,
                    errorMessage,
                } as Prisma.InputJsonValue,
            },
        });

        await this.assetService.createAsset({
            sessionId,
            assetType: 'NOTE',
            title: `${this.channelDisplayName(channel)}投递${status === 'SENT' ? '成功' : '失败'}`,
            payload: {
                deliveryTaskId,
                channel,
                exportTaskId: exportTask.id,
                status,
                deliveryMethod,
                to,
                target,
                subject,
                templateCode: normalizedTemplate,
                errorMessage,
            },
            sourceExecutionId: exportTask.workflowExecutionId,
        });

        return { deliveryTaskId, channel, status, errorMessage };
    }

    // ── Retry Wrapper ───────────────────────────────────────────────────────

    /**
     * 发送并在失败时指数退避重试（最多 MAX_DELIVERY_RETRIES 次）
     */
    private async sendWithRetry(
        sendFn: () => Promise<ChannelSendResult>,
    ): Promise<ChannelSendResult> {
        let lastResult: ChannelSendResult | null = null;

        for (let attempt = 0; attempt <= MAX_DELIVERY_RETRIES; attempt++) {
            lastResult = await sendFn();

            if (lastResult.status === 'SENT') {
                return { ...lastResult, retryCount: attempt };
            }

            // 最后一次不再等待
            if (attempt < MAX_DELIVERY_RETRIES) {
                const delayMs = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
                this.logger.warn(
                    `投递失败（第 ${attempt + 1}/${MAX_DELIVERY_RETRIES + 1} 次），` +
                    `${delayMs}ms 后重试: ${lastResult.errorMessage ?? ''}`,
                );
                await new Promise((resolve) => setTimeout(resolve, delayMs));
            }
        }

        this.logger.error(
            `投递最终失败（已重试 ${MAX_DELIVERY_RETRIES} 次）: ${lastResult?.errorMessage ?? ''}`,
        );
        return { ...lastResult!, retryCount: MAX_DELIVERY_RETRIES };
    }

    // ── Channel-specific Senders ────────────────────────────────────────────

    /**
     * 通过 nodemailer SMTP 直发邮件
     */
    private async sendViaSmtp(params: {
        to: string[];
        subject: string;
        content: string;
        fileName: string;
        downloadUrl: string;
        sendRawFile: boolean;
    }): Promise<ChannelSendResult> {
        const smtpHost = process.env.SMTP_HOST?.trim();
        const smtpPort = Number(process.env.SMTP_PORT) || 465;
        const smtpUser = process.env.SMTP_USER?.trim();
        const smtpPass = process.env.SMTP_PASS?.trim();
        const smtpFrom = process.env.SMTP_FROM?.trim() || smtpUser;

        if (!smtpHost || !smtpUser || !smtpPass) {
            // 回退到 webhook 代理
            const webhookUrl = process.env.MAIL_DELIVERY_WEBHOOK_URL?.trim();
            if (webhookUrl) {
                this.logger.warn('SMTP 未配置，回退到邮件 webhook 代理');
                return this.sendViaGenericWebhook({
                    channel: 'EMAIL',
                    deliveryTaskId: `smtp_fallback_${randomUUID()}`,
                    to: params.to,
                    subject: params.subject,
                    content: params.content,
                    fileName: params.fileName,
                    downloadUrl: params.downloadUrl,
                    sendRawFile: params.sendRawFile,
                });
            }
            return {
                status: 'FAILED',
                errorMessage: '未配置 SMTP 服务器（SMTP_HOST/USER/PASS）且无 webhook 回退',
                deliveryMethod: 'SMTP',
            };
        }

        try {
            const transporter = nodemailer.createTransport({
                host: smtpHost,
                port: smtpPort,
                secure: smtpPort === 465,
                auth: { user: smtpUser, pass: smtpPass },
            });

            const apiBase = process.env.API_BASE_URL?.trim() || 'http://localhost:3000';
            const fullDownloadUrl = `${apiBase}${params.downloadUrl}`;

            const htmlBody = `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
                    <h2 style="color: #1677ff;">📊 ${params.subject}</h2>
                    <p style="color: #333; line-height: 1.8;">${params.content}</p>
                    <hr style="border: none; border-top: 1px solid #e8e8e8; margin: 16px 0;" />
                    <p style="color: #999; font-size: 12px;">
                        报告附件：<a href="${fullDownloadUrl}">${params.fileName}</a>
                    </p>
                    <p style="color: #bbb; font-size: 11px;">本邮件由 CTBMS 智能助手自动发送</p>
                </div>
            `;

            await transporter.sendMail({
                from: smtpFrom,
                to: params.to.join(', '),
                subject: params.subject,
                html: htmlBody,
            });

            return { status: 'SENT', errorMessage: null, deliveryMethod: 'SMTP' };
        } catch (error) {
            this.logger.error(`SMTP 发送失败: ${error instanceof Error ? error.message : String(error)}`);
            return {
                status: 'FAILED',
                errorMessage: `SMTP 发送失败: ${error instanceof Error ? error.message : String(error)}`,
                deliveryMethod: 'SMTP',
            };
        }
    }

    /**
     * 通过企微机器人 Webhook 直调推送 Markdown 卡片
     */
    private async sendViaWecomWebhook(params: {
        target: string;
        subject: string;
        content: string;
        fileName: string;
        downloadUrl: string;
    }): Promise<ChannelSendResult> {
        const webhookUrl =
            params.target.startsWith('http')
                ? params.target
                : process.env.WECOM_DELIVERY_WEBHOOK_URL?.trim();

        if (!webhookUrl) {
            return {
                status: 'FAILED',
                errorMessage: '未配置企微 Webhook URL（WECOM_DELIVERY_WEBHOOK_URL 或 target）',
                deliveryMethod: 'WECOM_WEBHOOK',
            };
        }

        try {
            // WHY: 企微机器人消息格式要求 msgtype + markdown 正文
            const markdownContent = [
                `### ${params.subject}`,
                '',
                params.content,
                '',
                `> 📎 附件: [${params.fileName}](${params.downloadUrl})`,
                `> ⏰ ${new Date().toLocaleString('zh-CN')}`,
            ].join('\n');

            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    msgtype: 'markdown',
                    markdown: { content: markdownContent },
                }),
            });

            if (response.ok) {
                const body = await response.json() as Record<string, unknown>;
                // 企微返回 errcode=0 表示成功
                if (body.errcode !== undefined && body.errcode !== 0) {
                    return {
                        status: 'FAILED',
                        errorMessage: `企微返回错误: errcode=${String(body.errcode)} errmsg=${String(body.errmsg ?? '')}`,
                        deliveryMethod: 'WECOM_WEBHOOK',
                    };
                }
                return { status: 'SENT', errorMessage: null, deliveryMethod: 'WECOM_WEBHOOK' };
            }

            return {
                status: 'FAILED',
                errorMessage: `企微 Webhook 返回 HTTP ${response.status}`,
                deliveryMethod: 'WECOM_WEBHOOK',
            };
        } catch (error) {
            return {
                status: 'FAILED',
                errorMessage: `企微推送失败: ${error instanceof Error ? error.message : String(error)}`,
                deliveryMethod: 'WECOM_WEBHOOK',
            };
        }
    }

    /**
     * 通用 Webhook 代理（DINGTALK / FEISHU / EMAIL 回退）
     */
    private async sendViaGenericWebhook(params: {
        channel?: DeliveryChannel;
        deliveryTaskId?: string;
        exportTaskId?: string;
        to?: string[];
        target?: string;
        subject?: string;
        content?: string;
        templateCode?: DeliveryTemplateCode;
        metadata?: Record<string, unknown>;
        fileName?: string;
        downloadUrl?: string;
        sendRawFile?: boolean;
    }): Promise<ChannelSendResult> {
        const channel = params.channel ?? 'DINGTALK';
        const webhookUrl = this.resolveDeliveryWebhook(channel);

        if (!webhookUrl) {
            return {
                status: 'FAILED',
                errorMessage: `未配置 ${channel} 投递 webhook，无法实际投递`,
                deliveryMethod: 'GENERIC_WEBHOOK',
            };
        }

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deliveryTaskId: params.deliveryTaskId,
                    channel,
                    exportTaskId: params.exportTaskId,
                    to: params.to,
                    target: params.target,
                    subject: params.subject,
                    content: params.content,
                    templateCode: params.templateCode,
                    metadata: params.metadata,
                    attachment: {
                        fileName: params.fileName,
                        downloadUrl: params.downloadUrl,
                        mode: params.sendRawFile ? 'RAW_FILE' : 'EXPORT_FILE',
                    },
                }),
            });

            if (response.ok) {
                return { status: 'SENT', errorMessage: null, deliveryMethod: 'GENERIC_WEBHOOK' };
            }
            return {
                status: 'FAILED',
                errorMessage: `${channel} 投递网关返回 ${response.status}`,
                deliveryMethod: 'GENERIC_WEBHOOK',
            };
        } catch (error) {
            return {
                status: 'FAILED',
                errorMessage: error instanceof Error ? error.message : String(error),
                deliveryMethod: 'GENERIC_WEBHOOK',
            };
        }
    }

    // ── Channel Binding Management ──────────────────────────────────────────

    async resolveDeliveryChannelBinding(userId: string, _channel: DeliveryChannel) {
        return this.prisma.userConfigBinding.findFirst({
            where: {
                userId,
                bindingType: 'AGENT_COPILOT_DELIVERY_PROFILES',
                isActive: true,
            },
            orderBy: { priority: 'desc' },
        });
    }

    async listDeliveryChannelBindings(userId: string) {
        return this.prisma.userConfigBinding.findMany({
            where: { userId, bindingType: 'AGENT_COPILOT_DELIVERY_PROFILES' },
            orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
        });
    }

    async upsertDeliveryChannelBinding(userId: string, data: Record<string, unknown>) {
        const existing = await this.prisma.userConfigBinding.findFirst({
            where: { userId, bindingType: 'AGENT_COPILOT_DELIVERY_PROFILES' },
        });
        if (existing) {
            return this.prisma.userConfigBinding.update({
                where: { id: existing.id },
                data: { metadata: data as Prisma.InputJsonValue, updatedAt: new Date() },
            });
        }
        return this.prisma.userConfigBinding.create({
            data: {
                userId,
                bindingType: 'AGENT_COPILOT_DELIVERY_PROFILES',
                targetId: 'DEFAULT',
                metadata: data as Prisma.InputJsonValue,
                isActive: true,
                priority: 1,
            },
        });
    }

    // ── Private Helpers ─────────────────────────────────────────────────────

    normalizeDeliveryTemplateCode(
        templateCode: unknown,
    ): DeliveryTemplateCode {
        if (templateCode === 'MORNING_BRIEF') return 'MORNING_BRIEF';
        if (templateCode === 'WEEKLY_REVIEW') return 'WEEKLY_REVIEW';
        if (templateCode === 'RISK_ALERT') return 'RISK_ALERT';
        return 'DEFAULT';
    }

    private resolveDeliverySubject(
        channel: DeliveryChannel,
        templateCode: DeliveryTemplateCode,
        customSubject?: string,
    ) {
        if (customSubject?.trim()) return customSubject.trim();
        const cn = this.channelDisplayName(channel);
        if (templateCode === 'MORNING_BRIEF') return `${cn}晨报 - CTBMS 对话助手`;
        if (templateCode === 'WEEKLY_REVIEW') return `${cn}周复盘 - CTBMS 对话助手`;
        if (templateCode === 'RISK_ALERT') return `${cn}风险提示 - CTBMS 对话助手`;
        return 'CTBMS 对话助手分析报告';
    }

    private resolveDeliveryContent(
        channel: DeliveryChannel,
        templateCode: DeliveryTemplateCode,
        customContent?: string,
    ) {
        if (customContent?.trim()) return customContent.trim();
        const cn = this.channelDisplayName(channel);
        if (templateCode === 'MORNING_BRIEF') return `${cn}晨报已生成，请查收附件原文件与摘要。`;
        if (templateCode === 'WEEKLY_REVIEW')
            return `${cn}周度复盘已生成，请查收本周关键结论和风险提示。`;
        if (templateCode === 'RISK_ALERT')
            return `${cn}风险告警已触发，请优先查看风险暴露与应对建议。`;
        return '请查收本次对话分析结果。';
    }

    private resolveDeliveryWebhook(channel: DeliveryChannel) {
        if (channel === 'EMAIL') return process.env.MAIL_DELIVERY_WEBHOOK_URL?.trim();
        if (channel === 'DINGTALK') return process.env.DINGTALK_DELIVERY_WEBHOOK_URL?.trim();
        if (channel === 'WECOM') return process.env.WECOM_DELIVERY_WEBHOOK_URL?.trim();
        if (channel === 'FEISHU') return process.env.FEISHU_DELIVERY_WEBHOOK_URL?.trim();
        return null;
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
        templateCode?: DeliveryTemplateCode;
        sendRawFile?: boolean;
    }> {
        const bindings = await this.prisma.userConfigBinding.findMany({
            where: { userId, bindingType: 'AGENT_COPILOT_DELIVERY_PROFILES', isActive: true },
            orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
            take: 10,
            select: { metadata: true },
        });

        for (const binding of bindings) {
            const metadata = this.utilsService.toRecord(binding.metadata);
            const rawProfiles = metadata.profiles;
            if (!Array.isArray(rawProfiles)) continue;

            const profiles = rawProfiles.map((item) => this.utilsService.toRecord(item));
            const channelProfiles = profiles.filter(
                (profile) => this.utilsService.pickString(profile.channel) === channel,
            );
            if (!channelProfiles.length) continue;

            const selected =
                channelProfiles.find((profile) => Boolean(profile.isDefault)) ?? channelProfiles[0] ?? null;
            if (!selected) continue;

            const to = Array.isArray(selected.to)
                ? selected.to
                    .map((item) => this.utilsService.pickString(item))
                    .filter((item): item is string => Boolean(item))
                : undefined;

            return {
                to,
                target: this.utilsService.pickString(selected.target) ?? undefined,
                templateCode: this.utilsService.pickString(selected.templateCode)
                    ? this.normalizeDeliveryTemplateCode(selected.templateCode)
                    : undefined,
                sendRawFile: typeof selected.sendRawFile === 'boolean' ? selected.sendRawFile : undefined,
            };
        }
        return {};
    }

    channelDisplayName(channel: DeliveryChannel) {
        if (channel === 'EMAIL') return '邮件';
        if (channel === 'DINGTALK') return '钉钉';
        if (channel === 'WECOM') return '企业微信';
        return '飞书';
    }
}

