import React, { useMemo } from 'react';
import { Card, Descriptions, Tag, Space, Button, Divider, theme } from 'antd';
import { ResearchReportResponse, ReviewStatus, REPORT_TYPE_LABELS } from '@packages/types';
import { REVIEW_STATUS_LABELS, REVIEW_STATUS_COLORS } from '@/constants';
import {
  EyeOutlined,
  DownloadOutlined,
  ClockCircleOutlined,
  UserOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import { useDictionaries } from '@/hooks/useDictionaries';

interface ReportMetaCardProps {
  report: ResearchReportResponse;
  onDownload?: () => void;
}

export const ReportMetaCard: React.FC<ReportMetaCardProps> = ({ report, onDownload }) => {
  const { token } = theme.useToken();
  const { data: dictionaries } = useDictionaries(['REPORT_TYPE']);

  const reportTypeLabels = useMemo(() => {
    const items = dictionaries?.REPORT_TYPE?.filter((item) => item.isActive) || [];
    if (!items.length) return REPORT_TYPE_LABELS;
    return items.reduce<Record<string, string>>((acc, item) => {
      acc[item.code] = item.label;
      return acc;
    }, {});
  }, [dictionaries]);

  const reportTypeColors = useMemo(() => {
    const items = dictionaries?.REPORT_TYPE?.filter((item) => item.isActive) || [];
    const fallbackColors: Record<string, string> = {
      POLICY: 'volcano',
      MARKET: 'blue',
      RESEARCH: 'purple',
      INDUSTRY: 'cyan',
    };
    if (!items.length) return fallbackColors;
    return items.reduce<Record<string, string>>((acc, item) => {
      const color =
        (item.meta as { color?: string } | null)?.color || fallbackColors[item.code] || 'blue';
      acc[item.code] = color;
      return acc;
    }, {});
  }, [dictionaries]);

  const reviewStatusMeta = {
    labels: REVIEW_STATUS_LABELS,
    colors: REVIEW_STATUS_COLORS,
  };

  return (
    <Card title="研报信息" bordered={false} className="shadow-sm">
      <Descriptions
        column={1}
        size="small"
        labelStyle={{ width: '84px', color: token.colorTextSecondary }}
      >
        <Descriptions.Item label="发布时间">
          <Space>
            <ClockCircleOutlined />
            {report.publishDate
              ? dayjs(report.publishDate).format('YYYY-MM-DD')
              : dayjs(report.createdAt).format('YYYY-MM-DD')}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="来源机构">
          <Space>
            <UserOutlined />
            {report.source || '未知来源'}
          </Space>
        </Descriptions.Item>
        <Descriptions.Item label="报告类型">
          <Tag color={reportTypeColors[report.reportType] || 'blue'}>
            {reportTypeLabels[report.reportType] || report.reportType}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="涉及品种">
          <Space wrap>{report.commodities?.map((c) => <Tag key={c}>{c}</Tag>) || '-'}</Space>
        </Descriptions.Item>
        <Descriptions.Item label="涉及区域">
          <Space wrap>{report.regions?.map((r) => <Tag key={r}>{r}</Tag>) || '-'}</Space>
        </Descriptions.Item>
        <Descriptions.Item label="审核状态">
          <Tag color={reviewStatusMeta.colors[report.reviewStatus] || 'default'}>
            {reviewStatusMeta.labels[report.reviewStatus] || report.reviewStatus}
          </Tag>
        </Descriptions.Item>
        <Descriptions.Item label="版本">v{report.version}</Descriptions.Item>
      </Descriptions>

      <Divider dashed style={{ margin: '14px 0' }} />

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: token.colorTextSecondary,
          fontSize: '12px',
        }}
      >
        <Space>
          <EyeOutlined /> {report.viewCount} 阅读
        </Space>
        <Space>
          <DownloadOutlined /> {report.downloadCount} 下载
        </Space>
      </div>

      <div style={{ marginTop: 14 }}>
        <Button type="primary" block icon={<DownloadOutlined />} onClick={onDownload}>
          下载原文
        </Button>
      </div>
    </Card>
  );
};
