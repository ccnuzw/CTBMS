import React, { useState } from 'react';
import { App, Button, Card, Col, Flex, Input, Row, Space, Typography, theme, Tag, Spin } from 'antd';
import {
  AppstoreOutlined,
  PlayCircleOutlined,
  StarOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import {
  usePublishedWorkflows,
  useWorkflowDefinitionDetail,
  useTriggerWorkflowExecution
} from '../../workflow-studio/api/workflow-definitions';
import { WorkflowQuickRunnerModal } from '../../workflow-studio/components/workflow-definition/WorkflowQuickRunnerModal';

const { Title, Text, Paragraph } = Typography;

export const TemplateMarketPage: React.FC = () => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [searchParams, setSearchParams] = useSearchParams();

  const page = Number(searchParams.get('page') ?? '1');
  const pageSize = 20;
  const keyword = searchParams.get('keyword') ?? undefined;

  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const { data: pageData, isLoading } = usePublishedWorkflows({
    page,
    pageSize,
    keyword,
    orderBy: 'stars',
  });

  const { data: definitionDetail, isLoading: isDetailLoading } = useWorkflowDefinitionDetail(selectedWorkflowId ?? undefined);

  // Derive the active version to run
  const activeVersion = (definitionDetail as any)?.versions?.find((v: any) => v.versionCode === definitionDetail?.latestVersionCode) || (definitionDetail as any)?.versions?.[0];

  const triggerMutation = useTriggerWorkflowExecution();

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
    } catch (e) {
      // Error handled by standard interceptors
    }
  };

  const updateParams = (updates: Record<string, string | undefined>) => {
    const next = new URLSearchParams(searchParams);
    for (const [k, v] of Object.entries(updates)) {
      if (v) next.set(k, v); else next.delete(k);
    }
    setSearchParams(next);
  };

  return (
    <Space direction="vertical" style={{ width: '100%' }} size={24}>
      {/* 顶部 Banner 区 */}
      <Card bodyStyle={{ padding: '32px 24px', background: `linear-gradient(135deg, ${token.colorBgContainer}, ${token.colorPrimaryBg})` }} bordered={false}>
        <Flex justify="space-between" align="center" wrap="wrap" gap={16}>
          <Space direction="vertical" size={0}>
            <Title level={3} style={{ margin: 0 }}>
              <AppstoreOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
              工作流应用商店
            </Title>
            <Text type="secondary" style={{ fontSize: 16 }}>探索并在您的业务中零门槛应用先进的 AI 智能体工作流</Text>
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

      {/* 瀑布流展示区 */}
      <Spin spinning={isLoading}>
        <Row gutter={[16, 24]}>
          {(pageData?.data || []).map((workflow: any) => (
            <Col xs={24} sm={12} md={8} lg={6} xl={6} key={workflow.id}>
              <Card
                hoverable
                style={{ height: '100%', display: 'flex', flexDirection: 'column' }}
                bodyStyle={{ flex: 1, display: 'flex', flexDirection: 'column' }}
                cover={
                  <div style={{ height: 140, background: token.colorFillAlter, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {workflow.coverImage ? (
                      <img src={workflow.coverImage} alt="cover" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
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
                  </Button>
                ]}
              >
                <div style={{ flex: 1 }}>
                  <Flex justify="space-between" align="flex-start" style={{ marginBottom: 8 }}>
                    <Title level={5} style={{ margin: 0 }} ellipsis={{ rows: 2, tooltip: workflow.name }}>
                      {workflow.name}
                    </Title>
                  </Flex>
                  {workflow.categoryId && (
                    <Tag color="geekblue" style={{ marginBottom: 12 }}>
                      {workflow.categoryId}
                    </Tag>
                  )}
                  <Paragraph type="secondary" style={{ fontSize: 13, minHeight: 40 }} ellipsis={{ rows: 2 }}>
                    {workflow.description || '暂无详细描述'}
                  </Paragraph>
                </div>
                <div style={{ marginTop: 12, borderTop: `1px solid ${token.colorBorderSecondary}`, paddingTop: 12 }}>
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

      {/* 一键运行弹窗 */}
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
