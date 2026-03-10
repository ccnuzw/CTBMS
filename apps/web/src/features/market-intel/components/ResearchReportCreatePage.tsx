import {
  PageContainer,
  ProForm,
  ProCard,
  ProFormText,
  ProFormSelect,
  ProFormDatePicker,
  ProFormList,
  ProFormDigit,
  ProFormTextArea,
  ProFormItem,
} from '@ant-design/pro-components';
import {
  Space,
  Typography,
  Button,
  Badge,
  Row,
  Col,
  Empty,
  Result,
  Tag,
  theme,
  Progress,
  Modal,
  Alert,
} from 'antd';
import {
  FileWordOutlined,
  ThunderboltOutlined,
  FileSearchOutlined,
  RobotOutlined,
  CheckCircleOutlined,
  BulbOutlined,
  LineChartOutlined,
  BarChartOutlined,
  ExpandAltOutlined,
} from '@ant-design/icons';
import { ContentType } from '@packages/types';
import TiptapEditor from '@/components/TiptapEditor';
import { DocumentUploader } from './DocumentUploader';
import dayjs from 'dayjs';
import {
  useResearchReportCreateViewModel,
  getPeriodicReportTemplates,
} from './useResearchReportCreateViewModel';

const { Text } = Typography;

const cssStyles = `
.fullHeightItem {
    display: flex !important;
    flex-direction: column !important;
    flex: 1 !important;
    height: 100%;
    width: 100% !important;
    max-width: 100% !important;
    min-height: 0 !important;
}

.fullHeightItem .ant-form-item-row {
    flex: 1;
    display: flex !important;
    flex-direction: column !important;
    height: 100%;
    width: 100% !important;
}

.fullHeightItem .ant-form-item-control {
    flex: 1;
    display: flex !important;
    flex-direction: column !important;
    height: 100%;
    width: 100% !important;
    max-width: 100% !important;
}

.fullHeightItem .ant-form-item-control-input {
    flex: 1;
    display: flex !important;
    flex-direction: column !important;
    height: 100%;
    width: 100% !important;
}

.fullHeightItem .ant-form-item-control-input-content {
    flex: 1;
    display: flex !important;
    flex-direction: column !important;
    height: 100%;
    width: 100% !important;
}
`;

export const ResearchReportCreatePage = () => {
  const { token } = theme.useToken();
  const vm = useResearchReportCreateViewModel();

  const renderDocumentPreview = (customHeight?: number | string) => {
    const previewHeight = customHeight || 360;
    if (!vm.state.uploadedAttachment) {
      return (
        <Empty
          description="暂无上传文档"
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          style={{ padding: 24 }}
        />
      );
    }

    if (
      vm.state.uploadedAttachment.mimeType === 'application/pdf' ||
      vm.state.uploadedAttachment.filename?.endsWith('.pdf')
    ) {
      return (
        <iframe
          src={`/api/v1/market-intel/attachments/${vm.state.uploadedAttachment.id}/download?inline=true`}
          style={{ width: '100%', height: previewHeight, border: 'none' }}
          title="Document Preview"
        />
      );
    }

    if (vm.actions.isOfficeDoc(vm.state.uploadedAttachment.filename, vm.state.uploadedAttachment.mimeType)) {
      return (
        <div
          style={{
            height: previewHeight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexDirection: 'column',
            background: token.colorBgLayout,
          }}
        >
          <Result
            icon={<FileWordOutlined style={{ color: token.colorPrimary }} />}
            title="Office 文档暂不支持在线预览"
            subTitle={vm.state.uploadedAttachment.filename}
            extra={
              <Button
                type="primary"
                href={`/api/v1/market-intel/attachments/${vm.state.uploadedAttachment.id}/download`}
                target="_blank"
              >
                下载查看
              </Button>
            }
          />
        </div>
      );
    }

    if (vm.state.uploadedAttachment.mimeType?.startsWith('image/')) {
      return (
        <div style={{ padding: 20, textAlign: 'center' }}>
          <img
            src={`/api/v1/market-intel/attachments/${vm.state.uploadedAttachment.id}/download?inline=true`}
            alt="Preview"
            style={{ maxWidth: '100%', maxHeight: previewHeight }}
          />
        </div>
      );
    }

    return (
      <Empty
        description="该格式暂不支持预览"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        style={{ padding: 24 }}
      />
    );
  };

  return (
    <>
      <style>{cssStyles}</style>
      <PageContainer
        header={{
          title: vm.state.isPeriodicReport
            ? `${vm.state.isEditMode ? '编辑' : '填写'}${vm.state.periodicMeta?.label || '报告'}`
            : '智能研报工作台',
          subTitle: vm.state.isPeriodicReport
            ? `${vm.state.periodicMeta?.label} Report Entry`
            : 'Intelligent Research Workbench',
          onBack: () => vm.actions.navigate(-1),
          extra: [
            <Button
              key="ai"
              type="primary"
              icon={<ThunderboltOutlined />}
              onClick={() => vm.actions.handleAnalyzeEditorContent(['all'])}
              loading={vm.mutations.analyzeMutation.isPending}
            >
              AI 深度分析
            </Button>,
          ],
        }}
        content={
          vm.state.taskId && (
            <Alert
              message="任务正在进行中"
              description={vm.state.isPeriodicReport
                ? `该${vm.state.periodicMeta?.label}关联到您的采编任务。提交后任务将自动标记为已完成。`
                : '该研究报告直接关联到您的采编任务。保存草稿后，请务必点击【提交审核】以完成任务上报。'}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          )
        }
      >
        <ProForm
          form={vm.state.form}
          onFinish={(values: any) => vm.actions.handleFinish(values, 'save')}
          layout="vertical"
          submitter={{
            render: () => (
              <div
                style={{
                  position: 'sticky',
                  bottom: 0,
                  zIndex: 99,
                  padding: '16px 24px',
                  margin: '24px -24px -24px -24px',
                  background: token.colorBgContainer,
                  borderTop: `1px solid ${token.colorBorderSecondary}`,
                  display: 'flex',
                  justifyContent: 'flex-end',
                  gap: 12,
                  boxShadow: token.boxShadowSecondary,
                }}
              >
                <Button onClick={() => vm.state.form.resetFields()}>重置</Button>
                {!vm.state.isPeriodicReport && (
                  <Button
                    onClick={() => vm.state.form.submit()}
                    loading={vm.mutations.createMutation.isPending || vm.mutations.updateMutation.isPending}
                    size="large"
                  >
                    保存草稿
                  </Button>
                )}
                <Button
                  type="primary"
                  onClick={() => {
                    vm.state.form.validateFields().then((values) => {
                      vm.actions.handleFinish(values as any, 'submit');
                    });
                  }}
                  loading={
                    vm.state.isPeriodicReport
                      ? vm.mutations.submitPeriodicReport.isPending || vm.mutations.updatePeriodicReport.isPending
                      : vm.mutations.createMutation.isPending || vm.mutations.updateMutation.isPending || vm.mutations.submitReportMutation.isPending
                  }
                  icon={<CheckCircleOutlined />}
                  size="large"
                >
                  {vm.state.isPeriodicReport
                    ? `提交${vm.state.periodicMeta?.label}`
                    : vm.state.taskId ? '提交审核并完成任务' : '提交审核'}
                </Button>
              </div>
            ),
          }}
          initialValues={vm.state.initialValues}
        >
          {/* ============ 上层：输入工作区 ============ */}
          <Row gutter={[16, 16]} align="stretch" style={{ minHeight: 'calc(100vh - 140px)' }}>
            {/* Left sidebar - simplified in periodic mode */}
            <Col xs={24} lg={5} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: 16 }}>
                {!vm.state.isPeriodicReport && (
                  <ProCard
                    title={
                      <Space>
                        <FileSearchOutlined />
                        情报来源
                      </Space>
                    }
                    bordered
                    headerBordered
                    size="small"
                  >
                    <DocumentUploader
                      uploadMode="save"
                      contentType={ContentType.RESEARCH_REPORT}
                      skipKnowledgeSync={true}
                      onUploadSuccess={vm.actions.handleUploadSuccess}
                      onStartAnalysis={vm.actions.handleUploadAnalysisTrigger}
                      isAnalyzing={vm.mutations.analyzeMutation.isPending}
                    />
                  </ProCard>
                )}

                {/* 基础信息 */}
                <ProCard title="基础信息" bordered headerBordered size="small">
                  <ProFormText
                    name="title"
                    label="报告标题"
                    rules={[{ required: !vm.state.isPeriodicReport, message: '请输入标题' }]}
                    placeholder={vm.state.isPeriodicReport ? vm.state.autoTitle : '请输入研报标题'}
                  />
                  {vm.state.isPeriodicReport && (
                    <Text type="secondary" style={{ fontSize: 12, display: 'block', marginTop: -16, marginBottom: 16 }}>
                      留空将自动生成标题
                    </Text>
                  )}
                  {!vm.state.isPeriodicReport && (
                    <>
                      <Row gutter={8}>
                        <Col span={12}>
                          <ProFormSelect
                            name="reportType"
                            label="类型"
                            options={vm.data.reportTypeOptions}
                            rules={[{ required: true }]}
                          />
                        </Col>
                        <Col span={12}>
                          <ProFormSelect
                            name="reportPeriod"
                            label="周期"
                            options={vm.data.reportPeriodOptions}
                          />
                        </Col>
                      </Row>
                      <ProFormDatePicker name="publishAt" label="发布日期" width="100%" />
                      <ProFormText name="sourceType" label="来源机构" placeholder="如：中信期货" />
                    </>
                  )}
                </ProCard>

                {/* 分类标签 */}
                <ProCard title="分类标签" bordered headerBordered size="small">
                  <ProFormSelect
                    name="commodities"
                    label="关联品种"
                    mode="tags"
                    options={vm.data.commodityOptions}
                    placeholder="选择或输入品种"
                  />
                  <ProFormSelect
                    name="region"
                    label="关联区域"
                    mode="tags"
                    options={vm.data.regionOptions}
                    placeholder="选择或输入区域"
                  />
                </ProCard>
              </div>
            </Col>

            {/* 中间编辑区 */}
            <Col xs={24} lg={vm.state.isPeriodicReport ? 19 : 13} style={{ display: 'flex', flexDirection: 'column' }}>
              <div style={{ position: 'relative', width: '100%', flex: 1, minHeight: 600 }}>
                <ProCard
                  title={vm.state.isPeriodicReport ? `${vm.state.periodicMeta?.label}正文` : '研报正文'}
                  bordered
                  headerBordered
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                  bodyStyle={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'hidden',
                  }}
                  extra={
                    <Space>
                      {vm.state.hasAiData && (
                        <Tag color="success" icon={<CheckCircleOutlined />}>
                          已完成 AI 分析
                        </Tag>
                      )}
                    </Space>
                  }
                >
                  <ProFormTextArea
                    name="summary"
                    label="摘要（可由 AI 自动生成，也可手动编辑）"
                    placeholder="点击上方 'AI 深度分析' 按钮自动生成摘要，或手动输入..."
                    fieldProps={{
                      rows: 3,
                      maxLength: 500,
                      showCount: true,
                    }}
                  />
                  {vm.state.isPeriodicReport && (
                    <div style={{ marginBottom: 12 }}>
                      <Button
                        type="dashed"
                        onClick={() => {
                          const templates = getPeriodicReportTemplates();
                          const template = templates[vm.state.knowledgeType];
                          if (template) vm.state.form.setFieldValue('content', template);
                        }}
                      >
                        📝 加载{vm.state.periodicMeta?.label}模板
                      </Button>
                    </div>
                  )}
                  <ProFormItem
                    name="content"
                    rules={[{ required: true, message: '请输入正文内容' }]}
                    style={{ marginBottom: 0, flex: 1, display: 'flex', flexDirection: 'column' }}
                    className="fullHeightItem"
                  >
                    <TiptapEditor
                      minHeight={vm.state.isPeriodicReport ? 400 : 480}
                      placeholder={vm.state.isPeriodicReport
                        ? `请输入${vm.state.periodicMeta?.label}内容...\n\n支持 Markdown 格式，可使用标题、列表、表格等。也可点击上方按钮加载模板。`
                        : '在此输入研报内容，或从左侧上传文档自动导入...'}
                    />
                  </ProFormItem>
                </ProCard>
              </div>
            </Col>

            {/* 右侧上下文面板 */}
            {!vm.state.isPeriodicReport && (
              <Col xs={24} lg={6} style={{ display: 'flex', flexDirection: 'column' }}>
                <div
                  style={{
                    position: 'sticky',
                    top: 60,
                    marginTop: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 16,
                  }}
                >
                  <ProCard
                    title={
                      <Space>
                        <FileSearchOutlined />
                        原文资料
                      </Space>
                    }
                    bordered
                    headerBordered
                    size="small"
                    style={{ maxHeight: 520, overflow: 'hidden' }}
                    bodyStyle={{ padding: 12 }}
                    extra={
                      <Button
                        type="text"
                        icon={<ExpandAltOutlined />}
                        onClick={() => vm.setters.setIsPreviewModalOpen(true)}
                        disabled={!vm.state.uploadedAttachment}
                        title="放大预览"
                      />
                    }
                  >
                    <div style={{ maxHeight: 420, overflow: 'auto' }}>{renderDocumentPreview()}</div>
                    {vm.state.uploadedAttachment && (
                      <Button
                        type="link"
                        size="small"
                        href={`/api/v1/market-intel/attachments/${vm.state.uploadedAttachment.id}/download`}
                        target="_blank"
                        style={{ padding: 0, marginTop: 8 }}
                      >
                        下载原件
                      </Button>
                    )}
                  </ProCard>

                  <ProCard
                    title={
                      <Space>
                        <RobotOutlined style={{ color: token.colorPrimary }} />
                        AI 提示
                      </Space>
                    }
                    bordered
                    headerBordered
                    size="small"
                  >
                    <Space direction="vertical" size={8} style={{ width: '100%' }}>
                      <div>
                        <Text type="secondary">整体置信度</Text>
                        <Progress
                          percent={vm.state.aiResult?.confidenceScore || 0}
                          size="small"
                          status={(vm.state.aiResult?.confidenceScore || 0) >= 70 ? 'success' : 'active'}
                        />
                      </div>
                      <div>
                        <Text type="secondary">最近分析</Text>
                        <div style={{ marginTop: 4 }}>
                          <Tag color="blue">
                            {vm.state.aiSectionMeta.overall?.updatedAt
                              ? dayjs(vm.state.aiSectionMeta.overall.updatedAt).format('YYYY-MM-DD HH:mm')
                              : '尚未分析'}
                          </Tag>
                        </div>
                      </div>
                      <div>
                        <Text type="secondary">已提取</Text>
                        <div style={{ marginTop: 6 }}>
                          <Space wrap>
                            <Tag>观点 {(vm.state.keyPointsWatch as any[])?.length || 0}</Tag>
                            <Tag>数据 {(vm.state.dataPointsWatch as any[])?.length || 0}</Tag>
                            <Tag>预测 {(vm.state.predictionWatch as any)?.direction ? 1 : 0}</Tag>
                          </Space>
                        </div>
                      </div>
                      <Button
                        type="primary"
                        icon={<ThunderboltOutlined />}
                        onClick={() => vm.actions.handleAnalyzeEditorContent(['all'])}
                        loading={vm.mutations.analyzeMutation.isPending}
                      >
                        重新分析全部
                      </Button>
                    </Space>
                  </ProCard>
                </div>
              </Col>
            )}
          </Row>

          {/* ============ 下层：AI 智能分析结果区 ============ */}
          <ProCard
            title={
              <Space>
                <RobotOutlined style={{ color: token.colorPrimary }} />
                <span>AI 智能分析结果</span>
                {vm.state.hasAiData && <Badge status="success" text="已提取" />}
              </Space>
            }
            bordered
            headerBordered
            collapsible
            collapsed={vm.state.aiSectionCollapsed}
            onCollapse={vm.setters.setAiSectionCollapsed}
            style={{
              marginTop: 16,
              background: vm.state.hasAiData ? token.colorBgLayout : undefined,
            }}
            extra={
              !vm.state.hasAiData && (
                <Text type="secondary" style={{ fontSize: 12 }}>
                  点击上方「AI 深度分析」按钮自动提取
                </Text>
              )
            }
          >
            <Row gutter={[16, 16]}>
              <Col xs={24} lg={10}>
                <ProCard
                  title={
                    <Space>
                      <BulbOutlined style={{ color: token.colorWarning }} />
                      <span>核心观点</span>
                      <Badge count={(vm.state.keyPointsWatch as any[])?.length || 0} showZero={false} />
                    </Space>
                  }
                  bordered
                  size="small"
                  style={{ height: '100%' }}
                  extra={
                    <Space size={8}>
                      {vm.state.aiSectionMeta.keyPoints?.confidence !== undefined && (
                        <Tag color="blue">{vm.state.aiSectionMeta.keyPoints.confidence}%</Tag>
                      )}
                      <Button
                        size="small"
                        icon={<ThunderboltOutlined />}
                        onClick={() => vm.actions.handleAnalyzeEditorContent(['keyPoints'])}
                        loading={vm.mutations.analyzeMutation.isPending}
                      >
                        重新提取
                      </Button>
                    </Space>
                  }
                >
                  <ProFormList
                    name="keyPoints"
                    itemRender={({ listDom, action }, { record }) => {
                      const sentimentColor =
                        record?.sentiment === 'positive'
                          ? token.colorSuccess
                          : record?.sentiment === 'negative'
                            ? token.colorError
                            : token.colorBorder;
                      return (
                        <div
                          style={{
                            marginBottom: 12,
                            padding: 12,
                            borderRadius: token.borderRadius,
                            border: `1px solid ${token.colorBorder}`,
                            borderLeftWidth: 4,
                            borderLeftColor: sentimentColor,
                            background: token.colorBgContainer,
                          }}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <Space size={4}>
                              {record?.sentiment === 'positive' && <Tag color="success">利多</Tag>}
                              {record?.sentiment === 'negative' && <Tag color="error">利空</Tag>}
                              {record?.sentiment === 'neutral' && <Tag>中性</Tag>}
                              {record?.confidence && <Tag color="blue">{record.confidence}%</Tag>}
                            </Space>
                            {action}
                          </div>
                          {listDom}
                        </div>
                      );
                    }}
                    creatorButtonProps={{
                      creatorButtonText: '添加观点',
                      style: { width: '100%' },
                    }}
                  >
                    <ProFormTextArea
                      name="point"
                      placeholder="输入观点摘要..."
                      rules={[{ required: true }]}
                      fieldProps={{ autoSize: { minRows: 2, maxRows: 4 } }}
                    />
                    <Row gutter={8} style={{ marginTop: 8 }}>
                      <Col span={12}>
                        <ProFormSelect
                          name="sentiment"
                          placeholder="情绪倾向"
                          valueEnum={{
                            positive: { text: '利多', status: 'Success' },
                            negative: { text: '利空', status: 'Error' },
                            neutral: { text: '中性', status: 'Default' },
                          }}
                        />
                      </Col>
                      <Col span={12}>
                        <ProFormDigit name="confidence" placeholder="置信度%" min={0} max={100} />
                      </Col>
                    </Row>
                  </ProFormList>
                </ProCard>
              </Col>

              <Col xs={24} lg={7}>
                <ProCard
                  title={
                    <Space>
                      <LineChartOutlined style={{ color: token.colorInfo }} />
                      <span>后市预判</span>
                      {(vm.state.predictionWatch as any)?.direction && <Tag color="processing">已设置</Tag>}
                    </Space>
                  }
                  bordered
                  size="small"
                  style={{ height: '100%' }}
                  extra={
                    <Space size={8}>
                      {vm.state.aiSectionMeta.prediction?.confidence !== undefined && (
                        <Tag color="blue">{vm.state.aiSectionMeta.prediction.confidence}%</Tag>
                      )}
                      <Button
                        size="small"
                        icon={<ThunderboltOutlined />}
                        onClick={() => vm.actions.handleAnalyzeEditorContent(['prediction'])}
                        loading={vm.mutations.analyzeMutation.isPending}
                      >
                        重新提取
                      </Button>
                    </Space>
                  }
                >
                  <ProFormSelect
                    name={['prediction', 'direction']}
                    label="预测方向"
                    options={vm.data.predictionDirectionOptions}
                  />
                  <ProFormSelect
                    name={['prediction', 'timeframe']}
                    label="时间周期"
                    options={vm.data.predictionTimeframeOptions}
                  />
                  <ProFormTextArea
                    name={['prediction', 'reasoning']}
                    label="预测逻辑"
                    placeholder="AI 分析的预测逻辑..."
                    fieldProps={{ autoSize: { minRows: 3, maxRows: 6 } }}
                  />
                </ProCard>
              </Col>

              <Col xs={24} lg={7}>
                <ProCard
                  title={
                    <Space>
                      <BarChartOutlined style={{ color: token.colorSuccess }} />
                      <span>关键数据</span>
                      <Badge count={(vm.state.dataPointsWatch as any[])?.length || 0} showZero={false} />
                    </Space>
                  }
                  bordered
                  size="small"
                  style={{ height: '100%' }}
                  extra={
                    <Space size={8}>
                      {vm.state.aiSectionMeta.dataPoints?.confidence !== undefined && (
                        <Tag color="blue">{vm.state.aiSectionMeta.dataPoints.confidence}%</Tag>
                      )}
                      <Button
                        size="small"
                        icon={<ThunderboltOutlined />}
                        onClick={() => vm.actions.handleAnalyzeEditorContent(['dataPoints'])}
                        loading={vm.mutations.analyzeMutation.isPending}
                      >
                        重新提取
                      </Button>
                    </Space>
                  }
                >
                  <ProFormList
                    name="dataPoints"
                    itemRender={({ listDom, action }) => (
                      <div
                        style={{
                          marginBottom: 8,
                          padding: 12,
                          borderRadius: token.borderRadius,
                          border: `1px solid ${token.colorBorder}`,
                          background: token.colorBgContainer,
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 4 }}>
                          {action}
                        </div>
                        {listDom}
                      </div>
                    )}
                    creatorButtonProps={{
                      creatorButtonText: '添加数据指标',
                      style: { width: '100%' },
                    }}
                  >
                    <ProFormText
                      name="metric"
                      placeholder="指标名称 (如: 收盘价)"
                      rules={[{ required: true }]}
                    />
                    <Row gutter={8} style={{ marginTop: 8 }}>
                      <Col span={14}>
                        <ProFormText name="value" placeholder="数值" rules={[{ required: true }]} />
                      </Col>
                      <Col span={10}>
                        <ProFormText name="unit" placeholder="单位" />
                      </Col>
                    </Row>
                  </ProFormList>
                </ProCard>
              </Col>
            </Row>
            <Row gutter={[16, 16]}>
            </Row>
          </ProCard>
        </ProForm>
      </PageContainer>

      <Modal
        title="原文资料预览"
        open={vm.state.isPreviewModalOpen}
        onCancel={() => vm.setters.setIsPreviewModalOpen(false)}
        width={1000}
        footer={null}
        styles={{ body: { height: '70vh', padding: 0, overflow: 'hidden' } }}
        destroyOnClose
      >
        <div style={{ height: '100%', overflow: 'auto', padding: 16 }}>
          {renderDocumentPreview('100%')}
        </div>
      </Modal>
    </>
  );
};
