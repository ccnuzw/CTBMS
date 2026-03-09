import React, { useRef } from 'react';
import {
  Alert,
  App,
  Button,
  Card,
  Input,
  InputNumber,
  List,
  Modal,
  Segmented,
  Space,
  Switch,
  Typography,
} from 'antd';
import { PlusOutlined, UploadOutlined } from '@ant-design/icons';
import type {
  CapabilityRoutingPolicy,
  CopilotPromptScope,
  EphemeralCapabilityPolicy,
  EphemeralPolicyScope,
} from '../api/conversations';
import {
  QuickPromptTemplate,
  DEFAULT_CAPABILITY_ROUTING_POLICY,
  DEFAULT_EPHEMERAL_CAPABILITY_POLICY,
  RETRY_POLICY_PRESET_NETWORK,
  RETRY_POLICY_PRESET_STRICT,
  isSameQuickPromptTemplates,
  getOppositeScope,
  defaultQuickPrompts,
  QUICK_PROMPT_STORAGE_KEY_PREFIX,
} from './copilot-constants';

const { Text } = Typography;

export interface CopilotAdminModalsProps {
  // Template Modal
  templateModalOpen: boolean;
  setTemplateModalOpen: (open: boolean) => void;
  templateMode: 'FORM' | 'JSON';
  setTemplateMode: (mode: 'FORM' | 'JSON') => void;
  templateScope: CopilotPromptScope;
  setTemplateScope: (scope: CopilotPromptScope) => void;
  templateDraft: QuickPromptTemplate[];
  setTemplateDraft: React.Dispatch<React.SetStateAction<QuickPromptTemplate[]>>;
  templateEditor: string;
  setTemplateEditor: (value: string) => void;
  quickPrompts: QuickPromptTemplate[];
  setQuickPrompts: (prompts: QuickPromptTemplate[]) => void;
  activePromptTemplate: { id?: string; metadata?: unknown } | null | undefined;
  oppositePromptTemplate: { id?: string; metadata?: unknown } | null | undefined;
  upsertPromptTemplatesMutation: {
    mutateAsync: (input: {
      scope: CopilotPromptScope;
      bindingId?: string;
      templates: Record<string, unknown>[];
    }) => Promise<unknown>;
    isPending: boolean;
  };

  // Delivery Profile Modal
  deliveryProfileModalOpen: boolean;
  setDeliveryProfileModalOpen: (open: boolean) => void;
  deliveryProfileEditor: string;
  setDeliveryProfileEditor: (value: string) => void;
  handleSaveDeliveryProfiles: () => void;
  upsertDeliveryProfilesMutation: { isPending: boolean };

  // Routing Policy Modal
  routingPolicyModalOpen: boolean;
  setRoutingPolicyModalOpen: (open: boolean) => void;
  routingPolicyDraft: CapabilityRoutingPolicy;
  setRoutingPolicyDraft: React.Dispatch<React.SetStateAction<CapabilityRoutingPolicy>>;
  handleSaveRoutingPolicy: () => void;
  upsertCapabilityRoutingPolicyMutation: { isPending: boolean };

  // Ephemeral Policy Modal
  ephemeralPolicyModalOpen: boolean;
  setEphemeralPolicyModalOpen: (open: boolean) => void;
  ephemeralPolicyDraft: EphemeralCapabilityPolicy;
  setEphemeralPolicyDraft: React.Dispatch<React.SetStateAction<EphemeralCapabilityPolicy>>;
  ephemeralPolicyScope: EphemeralPolicyScope;
  setEphemeralPolicyScope: (scope: EphemeralPolicyScope) => void;
  handleSaveEphemeralPolicy: () => void;
  handleApplyRetryPolicyPreset: (preset: 'NETWORK' | 'STRICT') => void;
  handleRollbackEphemeralPolicyAudit: (auditId: string) => void;
  upsertEphemeralCapabilityPolicyMutation: { isPending: boolean };
  rollbackEphemeralPolicyAuditMutation: { isPending: boolean };
  ephemeralCapabilityPolicyBinding: Record<string, unknown> | null | undefined;
  ephemeralCapabilityPolicyAuditsQuery: { isLoading: boolean };
  ephemeralCapabilityPolicyAuditSummaryQuery: {
    data?: {
      total: number;
      stats: { action: Array<{ key: string; count: number }> };
    } | null;
  };
  displayedEphemeralPolicyAuditHistory: Array<{
    id: string;
    savedAt: string;
    runtimeGrantTtlHours: number;
    runtimeGrantMaxUseCount: number;
    retryableAllowlist: string[];
    nonRetryableBlocklist: string[];
  }>;
}

export const CopilotAdminModals: React.FC<CopilotAdminModalsProps> = (props) => {
  const { message, modal } = App.useApp();
  const templateFileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Template helpers ──
  const normalizeTemplateArray = (input: Array<Record<string, unknown>>) => {
    return input
      .map((item) => {
        const key = typeof item.key === 'string' ? item.key.trim() : '';
        const label = typeof item.label === 'string' ? item.label.trim() : '';
        const prompt = typeof item.prompt === 'string' ? item.prompt.trim() : '';
        if (!key || !label || !prompt) {
          return null;
        }
        return { key, label, prompt };
      })
      .filter((item): item is QuickPromptTemplate => Boolean(item));
  };

  const collectDuplicates = (items: QuickPromptTemplate[], field: 'key' | 'label') => {
    const seen = new Map<string, number>();
    for (const item of items) {
      const value = item[field].trim();
      seen.set(value, (seen.get(value) ?? 0) + 1);
    }
    return Array.from(seen.entries())
      .filter(([, count]) => count > 1)
      .map(([value]) => value);
  };

  const persistTemplates = async (next: QuickPromptTemplate[]) => {
    props.setQuickPrompts(next);
    localStorage.setItem(
      `${QUICK_PROMPT_STORAGE_KEY_PREFIX}.${props.templateScope}`,
      JSON.stringify(next),
    );
    try {
      await props.upsertPromptTemplatesMutation.mutateAsync({
        scope: props.templateScope,
        bindingId: props.activePromptTemplate?.id,
        templates: next,
      });
      message.success('模板保存成功（已同步到配置中心）');
    } catch {
      message.warning('模板已本地保存，但配置中心同步失败');
    } finally {
      props.setTemplateModalOpen(false);
    }
  };

  const handleSaveTemplates = async () => {
    try {
      const next =
        props.templateMode === 'FORM'
          ? props.templateDraft.filter((item) => item.key && item.label && item.prompt)
          : normalizeTemplateArray(
            JSON.parse(props.templateEditor) as Array<Record<string, unknown>>,
          );

      if (!next.length) {
        message.error('至少保留一个有效模板（含 key/label/prompt）');
        return;
      }

      const duplicateKeys = collectDuplicates(next, 'key');
      if (duplicateKeys.length) {
        message.error(`存在重复 key：${duplicateKeys.join('、')}，请修改后保存`);
        return;
      }

      const duplicateLabels = collectDuplicates(next, 'label');
      if (duplicateLabels.length) {
        modal.confirm({
          title: '检测到重复模板名称',
          content: `重复名称：${duplicateLabels.join('、')}。是否继续保存？`,
          okText: '继续保存',
          cancelText: '返回修改',
          onOk: async () => {
            await persistTemplates(next);
          },
        });
        return;
      }

      await persistTemplates(next);
    } catch {
      message.error('JSON 解析失败，请检查格式');
    }
  };

  const handleTemplateScopeChange = (scope: CopilotPromptScope) => {
    props.setTemplateScope(scope);
  };

  const handleCopyFromOppositeScope = () => {
    const sourceTemplates = (
      props.oppositePromptTemplate?.metadata as Record<string, unknown> | undefined
    )?.templates;
    if (!Array.isArray(sourceTemplates)) {
      message.warning('来源作用域暂无可复制模板');
      return;
    }

    const normalized = normalizeTemplateArray(sourceTemplates as Array<Record<string, unknown>>);
    if (!normalized.length) {
      message.warning('来源作用域模板无有效数据');
      return;
    }

    props.setTemplateDraft(normalized);
    props.setTemplateEditor(JSON.stringify(normalized, null, 2));
    props.setTemplateMode('FORM');
    message.success(
      `已从${getOppositeScope(props.templateScope) === 'PERSONAL' ? '个人' : '团队'}模板复制`,
    );
  };

  const handleAddTemplate = () => {
    const idx = props.templateDraft.length + 1;
    props.setTemplateDraft([
      ...props.templateDraft,
      {
        key: `custom-${Date.now()}-${idx}`,
        label: `模板${idx}`,
        prompt: '',
      },
    ]);
  };

  const handleRemoveTemplate = (key: string) => {
    props.setTemplateDraft(props.templateDraft.filter((item) => item.key !== key));
  };

  const handleUpdateTemplate = (key: string, patch: Partial<QuickPromptTemplate>) => {
    props.setTemplateDraft(
      props.templateDraft.map((item) => {
        if (item.key !== key) {
          return item;
        }
        const nextLabel = patch.label ?? item.label;
        const nextKey =
          patch.key ??
          item.key ??
          `tmpl-${nextLabel.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9\u4e00-\u9fa5\-_]/g, '')}`;
        return {
          ...item,
          ...patch,
          key: nextKey,
        };
      }),
    );
  };

  const handleExportTemplates = () => {
    const payload = JSON.stringify(
      props.templateMode === 'FORM' ? props.templateDraft : props.quickPrompts,
      null,
      2,
    );
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'ctbms-agent-copilot-templates.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTemplatesClick = () => {
    templateFileInputRef.current?.click();
  };

  const handleImportTemplatesFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Array<Record<string, unknown>>;
      if (!Array.isArray(parsed)) {
        message.error('导入失败：JSON 必须是数组');
        return;
      }

      const normalized = normalizeTemplateArray(parsed);
      if (!normalized.length) {
        message.error('导入失败：未识别到有效模板');
        return;
      }

      props.setTemplateDraft(normalized);
      props.setTemplateEditor(JSON.stringify(normalized, null, 2));
      props.setTemplateMode('FORM');
      message.success(`导入成功，共 ${normalized.length} 个模板`);
    } catch {
      message.error('导入失败：文件不是合法 JSON');
    }
  };

  return (
    <>
      <Modal
        title="快捷问题模板管理"
        open={props.templateModalOpen}
        onOk={handleSaveTemplates}
        onCancel={() => props.setTemplateModalOpen(false)}
        confirmLoading={props.upsertPromptTemplatesMutation.isPending}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space style={{ justifyContent: 'space-between', width: '100%' }}>
            <Segmented
              value={props.templateMode}
              options={[
                { label: '表单编辑', value: 'FORM' },
                { label: 'JSON 编辑', value: 'JSON' },
              ]}
              onChange={(value) => props.setTemplateMode(value as 'FORM' | 'JSON')}
            />
            <Segmented
              value={props.templateScope}
              options={[
                { label: '个人模板', value: 'PERSONAL' },
                { label: '团队模板', value: 'TEAM' },
              ]}
              onChange={(value) => handleTemplateScopeChange(value as CopilotPromptScope)}
            />
            <Space>
              <Button onClick={handleCopyFromOppositeScope}>从另一作用域复制</Button>
              <Button icon={<UploadOutlined />} onClick={handleImportTemplatesClick}>
                导入 JSON
              </Button>
              <Button onClick={handleExportTemplates}>导出 JSON</Button>
            </Space>
          </Space>

          <input
            ref={templateFileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={handleImportTemplatesFile}
          />

          <Alert
            type="info"
            showIcon
            message="JSON 数组格式"
            description='每项需包含 key、label、prompt。示例：[{"key":"k1","label":"周度复盘","prompt":"..."}]'
          />

          {props.templateMode === 'FORM' ? (
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button onClick={handleAddTemplate} icon={<PlusOutlined />}>
                新增模板
              </Button>
              <List
                size="small"
                dataSource={props.templateDraft}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button key="remove" danger size="small" onClick={() => handleRemoveTemplate(item.key)}>
                        删除
                      </Button>,
                    ]}
                  >
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Input
                        value={item.label}
                        placeholder="模板名称"
                        onChange={(e) =>
                          handleUpdateTemplate(item.key, {
                            label: e.target.value,
                          })
                        }
                      />
                      <Input.TextArea
                        value={item.prompt}
                        placeholder="模板提示词"
                        autoSize={{ minRows: 2, maxRows: 6 }}
                        onChange={(e) => handleUpdateTemplate(item.key, { prompt: e.target.value })}
                      />
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        key: {item.key}
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Space>
          ) : (
            <Input.TextArea
              value={props.templateEditor}
              onChange={(e) => props.setTemplateEditor(e.target.value)}
              autoSize={{ minRows: 12, maxRows: 20 }}
            />
          )}
        </Space>
      </Modal>

      <Modal
        title="投递配置中心"
        open={props.deliveryProfileModalOpen}
        onOk={props.handleSaveDeliveryProfiles}
        onCancel={() => props.setDeliveryProfileModalOpen(false)}
        confirmLoading={props.upsertDeliveryProfilesMutation.isPending}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="使用 JSON 管理各渠道默认投递目标与模板"
            description="字段建议：id/channel/isDefault/target/to/templateCode/sendRawFile/description"
          />
          <Input.TextArea
            value={props.deliveryProfileEditor}
            onChange={(e) => props.setDeliveryProfileEditor(e.target.value)}
            autoSize={{ minRows: 12, maxRows: 22 }}
          />
        </Space>
      </Modal>

      <Modal
        title="能力路由策略"
        open={props.routingPolicyModalOpen}
        onOk={props.handleSaveRoutingPolicy}
        onCancel={() => props.setRoutingPolicyModalOpen(false)}
        confirmLoading={props.upsertCapabilityRoutingPolicyMutation.isPending}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="用于控制能力复用顺序与命中阈值（普通用户无感）"
            description="建议默认：优先私有池，其次公共池。阈值越高，复用越保守。"
          />
          <Space>
            <Button
              size="small"
              onClick={() => props.setRoutingPolicyDraft(DEFAULT_CAPABILITY_ROUTING_POLICY)}
            >
              恢复推荐默认值
            </Button>
          </Space>
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>启用私有能力池</Text>
                <Switch
                  checked={props.routingPolicyDraft.allowOwnerPool}
                  onChange={(checked) =>
                    props.setRoutingPolicyDraft((prev) => ({
                      ...prev,
                      allowOwnerPool: checked,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>启用公共能力池</Text>
                <Switch
                  checked={props.routingPolicyDraft.allowPublicPool}
                  onChange={(checked) =>
                    props.setRoutingPolicyDraft((prev) => ({
                      ...prev,
                      allowPublicPool: checked,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>优先使用私有能力</Text>
                <Switch
                  checked={props.routingPolicyDraft.preferOwnerFirst}
                  onChange={(checked) =>
                    props.setRoutingPolicyDraft((prev) => ({
                      ...prev,
                      preferOwnerFirst: checked,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>私有池最低命中分</Text>
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  value={props.routingPolicyDraft.minOwnerScore}
                  onChange={(value) =>
                    props.setRoutingPolicyDraft((prev) => ({
                      ...prev,
                      minOwnerScore: typeof value === 'number' ? value : prev.minOwnerScore,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>公共池最低命中分</Text>
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  value={props.routingPolicyDraft.minPublicScore}
                  onChange={(value) =>
                    props.setRoutingPolicyDraft((prev) => ({
                      ...prev,
                      minPublicScore: typeof value === 'number' ? value : prev.minPublicScore,
                    }))
                  }
                />
              </Space>
            </Space>
          </Card>
        </Space>
      </Modal>

      <Modal
        title="临时能力策略"
        open={props.ephemeralPolicyModalOpen}
        onOk={props.handleSaveEphemeralPolicy}
        onCancel={() => props.setEphemeralPolicyModalOpen(false)}
        confirmLoading={props.upsertEphemeralCapabilityPolicyMutation.isPending}
        width={760}
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <Alert
            type="info"
            showIcon
            message="控制临时能力复用阈值与运行时授权策略"
            description="建议先保持默认，再根据 UAT 指标逐步微调。"
          />
          <Space>
            <Segmented
              size="small"
              value={props.ephemeralPolicyScope}
              options={[
                { label: '个人策略', value: 'PERSONAL' },
                { label: '团队策略', value: 'TEAM' },
              ]}
              onChange={(value) => props.setEphemeralPolicyScope(value as EphemeralPolicyScope)}
            />
            <Button
              size="small"
              onClick={() => props.setEphemeralPolicyDraft(DEFAULT_EPHEMERAL_CAPABILITY_POLICY)}
            >
              恢复推荐默认值
            </Button>
            <Button size="small" onClick={() => props.handleApplyRetryPolicyPreset('NETWORK')}>
              应用网络波动型
            </Button>
            <Button size="small" onClick={() => props.handleApplyRetryPolicyPreset('STRICT')}>
              应用严格型
            </Button>
          </Space>
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={8}>
              <Text strong>策略变更审计（最近20次）</Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                当前服务端版本更新时间：
                {(props.ephemeralCapabilityPolicyBinding?.updatedAt as string | undefined)
                  ? new Date(String(props.ephemeralCapabilityPolicyBinding!.updatedAt)).toLocaleString('zh-CN')
                  : '-'}
              </Text>
              <Text type="secondary" style={{ fontSize: 12 }}>
                审计汇总：
                {props.ephemeralCapabilityPolicyAuditSummaryQuery.data
                  ? `共 ${props.ephemeralCapabilityPolicyAuditSummaryQuery.data.total} 条，动作 ${props.ephemeralCapabilityPolicyAuditSummaryQuery.data.stats.action
                    .slice(0, 3)
                    .map((item) => `${item.key}(${item.count})`)
                    .join(' / ') || '-'}`
                  : '-'}
              </Text>
              <List
                size="small"
                dataSource={props.displayedEphemeralPolicyAuditHistory.slice(0, 6)}
                loading={props.ephemeralCapabilityPolicyAuditsQuery.isLoading}
                locale={{ emptyText: '暂无审计记录（首次保存策略后自动生成）' }}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Button
                        key={`rollback-${item.id}`}
                        size="small"
                        loading={props.rollbackEphemeralPolicyAuditMutation.isPending}
                        onClick={() => void props.handleRollbackEphemeralPolicyAudit(item.id)}
                      >
                        回滚到此版本
                      </Button>,
                    ]}
                  >
                    <Space direction="vertical" size={2} style={{ width: '100%' }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(item.savedAt).toLocaleString('zh-CN')} · TTL {item.runtimeGrantTtlHours}h · MaxUse{' '}
                        {item.runtimeGrantMaxUseCount}
                      </Text>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        白名单 {item.retryableAllowlist.length} 项 / 黑名单 {item.nonRetryableBlocklist.length} 项
                      </Text>
                    </Space>
                  </List.Item>
                )}
              />
            </Space>
          </Card>
          <Card size="small">
            <Space direction="vertical" style={{ width: '100%' }} size={12}>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>草稿语义复用阈值</Text>
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  value={props.ephemeralPolicyDraft.draftSemanticReuseThreshold}
                  onChange={(value) =>
                    props.setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      draftSemanticReuseThreshold:
                        typeof value === 'number' ? value : prev.draftSemanticReuseThreshold,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>已发布能力复用阈值</Text>
                <InputNumber
                  min={0}
                  max={1}
                  step={0.01}
                  value={props.ephemeralPolicyDraft.publishedSkillReuseThreshold}
                  onChange={(value) =>
                    props.setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      publishedSkillReuseThreshold:
                        typeof value === 'number' ? value : prev.publishedSkillReuseThreshold,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>运行时授权时长（小时）</Text>
                <InputNumber
                  min={1}
                  max={168}
                  step={1}
                  value={props.ephemeralPolicyDraft.runtimeGrantTtlHours}
                  onChange={(value) =>
                    props.setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      runtimeGrantTtlHours: typeof value === 'number' ? value : prev.runtimeGrantTtlHours,
                    }))
                  }
                />
              </Space>
              <Space style={{ justifyContent: 'space-between', width: '100%' }}>
                <Text>运行时授权最大使用次数</Text>
                <InputNumber
                  min={1}
                  max={200}
                  step={1}
                  value={props.ephemeralPolicyDraft.runtimeGrantMaxUseCount}
                  onChange={(value) =>
                    props.setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      runtimeGrantMaxUseCount: typeof value === 'number' ? value : prev.runtimeGrantMaxUseCount,
                    }))
                  }
                />
              </Space>
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Text>可重试错误码白名单（每行一个）</Text>
                <Input.TextArea
                  autoSize={{ minRows: 3, maxRows: 6 }}
                  value={props.ephemeralPolicyDraft.replayRetryableErrorCodeAllowlist.join('\n')}
                  onChange={(e) =>
                    props.setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      replayRetryableErrorCodeAllowlist: e.target.value
                        .split('\n')
                        .map((item) => item.trim().toUpperCase())
                        .filter(Boolean),
                    }))
                  }
                />
              </Space>
              <Space direction="vertical" style={{ width: '100%' }} size={4}>
                <Text>不可重试错误码黑名单（每行一个）</Text>
                <Input.TextArea
                  autoSize={{ minRows: 3, maxRows: 6 }}
                  value={props.ephemeralPolicyDraft.replayNonRetryableErrorCodeBlocklist.join('\n')}
                  onChange={(e) =>
                    props.setEphemeralPolicyDraft((prev) => ({
                      ...prev,
                      replayNonRetryableErrorCodeBlocklist: e.target.value
                        .split('\n')
                        .map((item) => item.trim().toUpperCase())
                        .filter(Boolean),
                    }))
                  }
                />
              </Space>
            </Space>
          </Card>
        </Space>
      </Modal>
    </>
  );
};
