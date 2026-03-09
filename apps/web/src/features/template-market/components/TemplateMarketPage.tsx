import React, { useMemo, useState } from 'react';
import {
  App,
  Button,
  Card,
  Col,
  Divider,
  Empty,
  Flex,
  Input,
  Row,
  Space,
  Spin,
  Switch,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd';
import {
  ApiOutlined,
  AppstoreOutlined,
  DatabaseOutlined,
  LinkOutlined,
  PlayCircleOutlined,
  RocketOutlined,
  StarOutlined,
} from '@ant-design/icons';
import type {
  TemplateCatalogQuickstartBusinessTemplateDto,
  TemplateCatalogQuickstartConnectorDraftDto,
} from '@packages/types';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { getErrorMessage } from '../../../api/client';
import { useCreateDataConnector } from '../../workflow-data-connector/api';
import {
  usePublishedWorkflows,
  useTriggerWorkflowExecution,
  useWorkflowDefinitionDetail,
} from '../../workflow-studio/api/workflow-definitions';
import {
  useQuickstartBusinessTemplateAcceptanceChecklist,
  useQuickstartBusinessTemplates,
} from '../api';
import { WorkflowQuickRunnerModal } from '../../workflow-studio/components/workflow-definition/WorkflowQuickRunnerModal';

const { Title, Text, Paragraph } = Typography;

const sourceDomainLabelMap: Record<string, string> = {
  INTERNAL_BUSINESS: '内部业务数据',
  PUBLIC_MARKET_INFO: '公开市场情报',
  FUTURES_MARKET: '期货市场',
  WEATHER: '天气数据',
  LOGISTICS: '物流数据',
};

const acceptanceCheckLabelMap: Record<string, string> = {
  CONNECTOR_COVERAGE: '连接器覆盖',
  CONNECTOR_CONTRACT_READY: '契约完整',
  RUN_READY: '运行就绪',
  EXPORT_READY: '导出就绪',
  EVIDENCE_READY: '证据就绪',
};

export const TemplateMarketPage: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = 20;
  const keyword = searchParams.get('keyword') ?? undefined;

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [quickstartKeyword, setQuickstartKeyword] = useState('');
  const [strictContract, setStrictContract] = useState(true);
  const [creatingTemplateCode, setCreatingTemplateCode] = useState<string | null>(null);
  const [creatingDraftCode, setCreatingDraftCode] = useState<string | null>(null);

  const { data: pageData, isLoading } = usePublishedWorkflows({
    page,
    pageSize,
    keyword,
    orderBy: 'stars',
  });
  const { data: quickstartData, isLoading: isQuickstartLoading } = useQuickstartBusinessTemplates({
    keyword: quickstartKeyword.trim() || undefined,
  });
  const { data: quickstartChecklistData, isLoading: isChecklistLoading } =
    useQuickstartBusinessTemplateAcceptanceChecklist({
      keyword: quickstartKeyword.trim() || undefined,
      strictContract,
    });
  const { data: definitionDetail, isLoading: isDetailLoading } = useWorkflowDefinitionDetail(
    selectedWorkflowId ?? undefined,
  );

  const quickstartChecklistMap = useMemo(() => {
    const entries = quickstartChecklistData?.items ?? [];
    return new Map(entries.map((item) => [item.code, item]));
  }, [quickstartChecklistData]);

  const activeVersion =
    (definitionDetail as any)?.versions?.find(
      (v: any) => v.versionCode === definitionDetail?.latestVersionCode,
    ) || (definitionDetail as any)?.versions?.[0];

  const triggerMutation = useTriggerWorkflowExecution();
  const createConnectorMutation = useCreateDataConnector();

  const handleRun = async (paramSnapshot: Record<string, unknown>) => {
    if (!definitionDetail?.id) return;
    try {
      await triggerMutation.mutateAsync({
        workflowDefinitionId: definitionDetail.id,
        workflowVersionId: activeVersion?.id,
        paramSnapshot,
      });
      message.success('已启动工作流执行');
      setSelectedWorkflowId(null);
    } catch {
      // handled by interceptor
    }
  };

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    setSearchParams(next);
  };

  const createConnectorDraft = async (draft: TemplateCatalogQuickstartConnectorDraftDto) => {
    try {
      setCreatingDraftCode(draft.connectorCode);
      await createConnectorMutation.mutateAsync(draft);
      message.success(`已创建连接器：${draft.connectorName}`);
    } catch (error) {
      message.error(getErrorMessage(error) || `创建连接器失败：${draft.connectorName}`);
    } finally {
      setCreatingDraftCode(null);
    }
  };

  const createTemplateConnectors = async (
    template: TemplateCatalogQuickstartBusinessTemplateDto,
  ) => {
    if (!template.connectorCreateDrafts.length) {
      message.info('该模板没有可创建的连接器草稿');
      return;
    }

    setCreatingTemplateCode(template.code);
    let successCount = 0;
    let failedCount = 0;

    for (const draft of template.connectorCreateDrafts) {
      try {
        await createConnectorMutation.mutateAsync(draft);
        successCount += 1;
      } catch {
        failedCount += 1;
      }
    }

    setCreatingTemplateCode(null);
    if (failedCount === 0) {
      message.success(`模板「${template.name}」连接器创建完成（${successCount} 个）`);
      return;
    }
    message.warning(
      `模板「${template.name}」创建完成：成功 ${successCount} 个，失败 ${failedCount} 个。可能存在编码冲突。`,
    );
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      <Card
        bodyStyle={{
          padding: '32px 24px',
          background: `linear-gradient(135deg, ${token.colorBgContainer}, ${token.colorPrimaryBg})`,
        }}
        bordered={false}
      >
        <Flex justify="space-between" align="center" wrap="wrap" gap={16}>
          <Space direction="vertical" size={0}>
            <Title level={3} style={{ margin: 0 }}>
              <AppstoreOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
              工作流应用商店
            </Title>
            <Text type="secondary" style={{ fontSize: 16 }}>
              探索并在您的业务中零门槛应用先进的 AI 智能体工作流
            </Text>
          </Space>
          <Input.Search
            allowClear
            size="large"
            placeholder="搜索应用与模板..."
            style={{ width: 300, boxShadow: token.boxShadowSecondary }}
            defaultValue={keyword}
            onSearch={(v) => updateParams({ keyword: v || undefined, page: '1' })}
          />
        </Flex>
      </Card>

      <Card>
        <Flex justify="space-between" align="center" wrap="wrap" gap={12}>
          <Space direction="vertical" size={0}>
            <Title level={4} style={{ margin: 0 }}>
              业务快启模板
            </Title>
            <Text type="secondary">按场景快速生成连接器契约，减少手工配置时间</Text>
          </Space>
          <Space>
            <Tooltip title="严格模式会校验 request/response schema、时效 SLA 与 permissionScope">
              <Switch
                checked={strictContract}
                onChange={(checked) => setStrictContract(checked)}
                checkedChildren="严格契约"
                unCheckedChildren="基础契约"
              />
            </Tooltip>
            {quickstartChecklistData ? (
              <Tag color={quickstartChecklistData.failed > 0 ? 'error' : 'success'}>
                上线就绪 {quickstartChecklistData.passed}/{quickstartChecklistData.total}
              </Tag>
            ) : (
              <Tag color="default">验收清单加载中</Tag>
            )}
            <Input.Search
              allowClear
              placeholder="筛选业务模板"
              style={{ width: 220 }}
              onSearch={(value) => setQuickstartKeyword(value)}
            />
            <Button icon={<LinkOutlined />} onClick={() => navigate('/workflow/connectors')}>
              连接器中心
            </Button>
          </Space>
        </Flex>

        <Divider style={{ margin: '16px 0' }} />

        <Spin spinning={isQuickstartLoading}>
          {(quickstartData?.templates?.length ?? 0) > 0 ? (
            <Row gutter={[16, 16]}>
              {quickstartData?.templates.map((template) => (
                <Col xs={24} md={12} key={template.code}>
                  <Card size="small" style={{ height: '100%' }}>
                    <Space direction="vertical" style={{ width: '100%' }} size={10}>
                      {(() => {
                        const acceptance = quickstartChecklistMap.get(template.code);
                        const failedCheckMessages =
                          acceptance?.checks
                            ?.filter((check) => !check.passed)
                            .map(
                              (check) =>
                                `${acceptanceCheckLabelMap[check.key] ?? check.key}：${check.message}`,
                            ) ?? [];

                        const readinessTag = acceptance ? (
                          acceptance.passed ? (
                            <Tag color="success">验收通过</Tag>
                          ) : (
                            <Tooltip title={failedCheckMessages.join('\n') || '存在待修复项'}>
                              <Tag color="error">待修复 {acceptance.failedChecks.length}</Tag>
                            </Tooltip>
                          )
                        ) : isChecklistLoading ? (
                          <Tag color="processing">验收中</Tag>
                        ) : (
                          <Tag color="default">未评估</Tag>
                        );

                        return (
                          <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                            <Title level={5} style={{ margin: 0 }}>
                              {template.name}
                            </Title>
                            <Space size={4} wrap>
                              <Tag color="blue">{template.category}</Tag>
                              {readinessTag}
                            </Space>
                          </Flex>
                        );
                      })()}

                      <Paragraph
                        type="secondary"
                        style={{ marginBottom: 0 }}
                        ellipsis={{ rows: 2 }}
                      >
                        {template.description}
                      </Paragraph>

                      <Space size={4} wrap>
                        {template.tags.map((tag) => (
                          <Tag key={tag}>{tag}</Tag>
                        ))}
                      </Space>

                      <div>
                        <Text type="secondary">推荐数据域：</Text>
                        <Space size={4} wrap style={{ marginTop: 4 }}>
                          {template.recommendedConnectors.map((sourceDomain) => (
                            <Tag color="processing" key={sourceDomain}>
                              {sourceDomainLabelMap[sourceDomain] ?? sourceDomain}
                            </Tag>
                          ))}
                        </Space>
                      </div>

                      <Space direction="vertical" style={{ width: '100%' }} size={6}>
                        {template.connectorCreateDrafts.map((draft) => (
                          <Flex
                            key={draft.connectorCode}
                            justify="space-between"
                            align="center"
                            style={{
                              padding: '8px 10px',
                              border: `1px solid ${token.colorBorderSecondary}`,
                              borderRadius: token.borderRadius,
                            }}
                          >
                            <Space size={8}>
                              <DatabaseOutlined style={{ color: token.colorPrimary }} />
                              <Space direction="vertical" size={0}>
                                <Text>{draft.connectorName}</Text>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                  {draft.connectorCode}
                                </Text>
                              </Space>
                            </Space>
                            <Button
                              size="small"
                              loading={
                                createConnectorMutation.isPending &&
                                creatingDraftCode === draft.connectorCode
                              }
                              onClick={() => void createConnectorDraft(draft)}
                            >
                              创建
                            </Button>
                          </Flex>
                        ))}
                      </Space>

                      <Flex justify="space-between" align="center" wrap="wrap" gap={8}>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          产物：{template.outputArtifacts.join(' / ')}
                        </Text>
                        <Button
                          type="primary"
                          icon={<ApiOutlined />}
                          loading={
                            createConnectorMutation.isPending &&
                            creatingTemplateCode === template.code
                          }
                          onClick={() => void createTemplateConnectors(template)}
                        >
                          创建全部连接器
                        </Button>
                      </Flex>
                    </Space>
                  </Card>
                </Col>
              ))}
            </Row>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无匹配的业务快启模板" />
          )}
        </Spin>
      </Card>

      <Spin spinning={isLoading}>
        <Row gutter={[16, 24]}>
          {(pageData?.data || []).map((workflow: any) => (
            <Col xs={24} sm={12} md={8} lg={6} xl={6} key={workflow.id}>
              <Card
                hoverable
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                cover={
                  <div
                    style={{
                      height: 140,
                      background: token.colorFillAlter,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {workflow.coverImage ? (
                      <img
                        src={workflow.coverImage}
                        alt="cover"
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <RocketOutlined style={{ fontSize: 48, color: token.colorTextQuaternary }} />
                    )}
                  </div>
                }
                actions={[
                  <Button
                    type="primary"
                    icon={<PlayCircleOutlined />}
                    onClick={() => setSelectedWorkflowId(workflow.id)}
                    style={{ width: '80%' }}
                  >
                    立即运行
                  </Button>,
                ]}
              >
                <div style={{ flex: 1 }}>
                  <Flex justify="space-between" align="flex-start" style={{ marginBottom: 8 }}>
                    <Title
                      level={5}
                      style={{ margin: 0 }}
                      ellipsis={{ rows: 2, tooltip: workflow.name }}
                    >
                      {workflow.name}
                    </Title>
                  </Flex>
                  {workflow.categoryId && (
                    <Tag color="geekblue" style={{ marginBottom: 12 }}>
                      {workflow.categoryId}
                    </Tag>
                  )}
                  <Paragraph
                    type="secondary"
                    style={{ fontSize: 13, minHeight: 40 }}
                    ellipsis={{ rows: 2 }}
                  >
                    {workflow.description || '暂无详细描述'}
                  </Paragraph>
                </div>
                <div
                  style={{
                    marginTop: 12,
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                    paddingTop: 12,
                  }}
                >
                  <Flex justify="space-between" align="center">
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {workflow.ownerUser?.name || '系统预设'}
                    </Text>
                    <Space size={4}>
                      <StarOutlined style={{ color: token.colorWarning }} />
                      <Text strong>{workflow.stars}</Text>
                    </Space>
                  </Flex>
                </div>
              </Card>
            </Col>
          ))}
        </Row>

        {pageData?.data?.length === 0 && (
          <Flex justify="center" align="center" style={{ minHeight: 200 }}>
            <Text type="secondary">没有找到匹配的已发布工作流应用</Text>
          </Flex>
        )}
      </Spin>

      <WorkflowQuickRunnerModal
        open={Boolean(selectedWorkflowId)}
        definition={definitionDetail!}
        version={activeVersion}
        loading={isDetailLoading || triggerMutation.isPending}
        onClose={() => setSelectedWorkflowId(null)}
        onRun={handleRun}
      />
    </Space>
  );
};
