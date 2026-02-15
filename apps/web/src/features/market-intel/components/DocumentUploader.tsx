import React, { useState } from 'react';
import {
  Upload,
  Card,
  Typography,
  Progress,
  Tag,
  Flex,
  Button,
  Alert,
  theme,
  App,
  Space,
  Descriptions,
} from 'antd';
import {
  InboxOutlined,
  FileTextOutlined,
  FilePdfOutlined,
  FileExcelOutlined,
  FileWordOutlined,
  PictureOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  DeleteOutlined,
} from '@ant-design/icons';
import type { UploadFile, UploadProps } from 'antd';
import { ContentType, IntelSourceType } from '../types';

const { Text, Title } = Typography;
const { Dragger } = Upload;

interface DocumentUploaderProps {
  contentType?: ContentType;
  sourceType?: IntelSourceType;
  location?: string;
  onUploadSuccess?: (result: UploadResult) => void;
  onStartAnalysis?: (content: string) => void;
  onViewDetail?: (intelId: string) => void;
  onCancel?: () => void;
  isAnalyzing?: boolean;
}

export interface UploadResult {
  success: boolean;
  intel: {
    id: string;
    rawContent: string;
  };
  attachment: {
    id: string;
    filename: string;
    mimeType: string;
    fileSize: number;
  };
  message: string;
}

const MIME_TYPE_ICONS: Record<string, React.ReactNode> = {
  'application/pdf': <FilePdfOutlined style={{ color: '#ff4d4f' }} />,
  'application/msword': <FileWordOutlined style={{ color: '#1890ff' }} />,
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': (
    <FileWordOutlined style={{ color: '#1890ff' }} />
  ),
  'application/vnd.ms-excel': <FileExcelOutlined style={{ color: '#52c41a' }} />,
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': (
    <FileExcelOutlined style={{ color: '#52c41a' }} />
  ),
  'image/jpeg': <PictureOutlined style={{ color: '#722ed1' }} />,
  'image/png': <PictureOutlined style={{ color: '#722ed1' }} />,
  'text/plain': <FileTextOutlined />,
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
};

export const DocumentUploader: React.FC<DocumentUploaderProps> = ({
  contentType,
  sourceType,
  location,
  onUploadSuccess,
  onStartAnalysis,
  onViewDetail,
  onCancel,
  isAnalyzing = false,
}) => {
  const { token } = theme.useToken();
  const { message } = App.useApp();
  const [fileList, setFileList] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);

  const handleUpload = async () => {
    if (fileList.length === 0) {
      message.warning('请先选择文件');
      return;
    }

    const file = fileList[0];
    const formData = new FormData();
    formData.append('file', (file.originFileObj || file) as Blob);
    if (sourceType) formData.append('sourceType', sourceType);
    if (contentType) formData.append('contentType', contentType);
    formData.append('location', location || '文档上传');

    setUploading(true);

    try {
      const response = await fetch('/api/market-intel/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || '上传失败');
      }

      const result: UploadResult = await response.json();
      setUploadResult(result);
      message.success('文档上传成功');
      onUploadSuccess?.(result);
    } catch (error) {
      message.error(error instanceof Error ? error.message : '上传失败');
    } finally {
      setUploading(false);
    }
  };

  const uploadProps: UploadProps = {
    name: 'file',
    multiple: false,
    maxCount: 1,
    fileList,
    beforeUpload: (file) => {
      const isAllowed = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'image/jpeg',
        'image/png',
        'image/webp',
        'text/plain',
      ].includes(file.type);

      if (!isAllowed) {
        message.error('不支持的文件类型');
        return Upload.LIST_IGNORE;
      }

      const isLt20M = file.size / 1024 / 1024 < 20;
      if (!isLt20M) {
        message.error('文件大小不能超过 20MB');
        return Upload.LIST_IGNORE;
      }

      setFileList([file as unknown as UploadFile]);
      setUploadResult(null);
      return false; // 阻止自动上传
    },
    onRemove: () => {
      setFileList([]);
      setUploadResult(null);
    },
  };

  return (
    <div style={{ overflow: 'hidden' }}>
      {/* 上传区域 */}
      {!uploadResult && fileList.length === 0 && (
        <Dragger {...uploadProps} style={{ marginBottom: 16 }}>
          <p className="ant-upload-drag-icon" style={{ marginBottom: 8 }}>
            <InboxOutlined style={{ color: token.colorPrimary, fontSize: 36 }} />
          </p>
          <p className="ant-upload-text" style={{ fontSize: 13, marginBottom: 4 }}>
            点击或拖拽文件上传
          </p>
          <p
            className="ant-upload-hint"
            style={{ color: token.colorTextSecondary, fontSize: 12, marginBottom: 8 }}
          >
            支持 PDF、Word、Excel、图片
          </p>
          <Flex justify="center" gap={4} wrap="wrap">
            <Tag style={{ margin: 2, fontSize: 11 }}>PDF</Tag>
            <Tag style={{ margin: 2, fontSize: 11 }}>Word</Tag>
            <Tag style={{ margin: 2, fontSize: 11 }}>Excel</Tag>
            <Tag style={{ margin: 2, fontSize: 11 }}>图片</Tag>
          </Flex>
        </Dragger>
      )}

      {/* 文件预览 */}
      {fileList.length > 0 && !uploadResult && (
        <Card
          size="small"
          style={{
            marginBottom: 16,
            background: token.colorBgContainerDisabled,
          }}
          bodyStyle={{ padding: 12 }}
        >
          <Flex align="center" justify="space-between" gap={8}>
            <Flex align="center" gap={8} style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 24, flexShrink: 0 }}>
                {MIME_TYPE_ICONS[fileList[0].type || ''] || <FileTextOutlined />}
              </div>
              <div style={{ minWidth: 0, flex: 1 }}>
                <Text strong ellipsis style={{ display: 'block', fontSize: 13 }}>
                  {fileList[0].name}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatFileSize(fileList[0].size || 0)}
                </Text>
              </div>
            </Flex>
            <Button
              type="text"
              danger
              size="small"
              icon={<DeleteOutlined />}
              onClick={() => setFileList([])}
            />
          </Flex>
        </Card>
      )}

      {/* 上传结果 */}
      {uploadResult && (
        <Alert
          type="success"
          showIcon
          icon={<CheckCircleOutlined />}
          message="上传成功"
          description={
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <div style={{ marginBottom: 4 }}>
                <Text type="secondary">文件：</Text>
                <Text
                  ellipsis
                  style={{ maxWidth: 150, display: 'inline-block', verticalAlign: 'bottom' }}
                >
                  {uploadResult.attachment.filename}
                </Text>
              </div>
              <div>
                <Text type="secondary">大小：</Text>
                <Text>{formatFileSize(uploadResult.attachment.fileSize)}</Text>
              </div>
            </div>
          }
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 操作按钮 */}
      <Flex justify="flex-end" gap={8} wrap="wrap">
        {onCancel && !uploadResult && (
          <Button size="small" onClick={onCancel}>
            取消
          </Button>
        )}
        {!uploadResult ? (
          <Button
            type="primary"
            size="small"
            onClick={handleUpload}
            loading={uploading}
            disabled={fileList.length === 0}
            icon={uploading ? <LoadingOutlined /> : undefined}
          >
            {uploading ? '上传中...' : '上传'}
          </Button>
        ) : (
          <Space size={8} wrap>
            <Button
              size="small"
              onClick={() => {
                setFileList([]);
                setUploadResult(null);
              }}
            >
              继续上传
            </Button>
            {onStartAnalysis && uploadResult.intel.rawContent && (
              <Button
                type="primary"
                size="small"
                onClick={() => onStartAnalysis(uploadResult.intel.rawContent)}
                loading={isAnalyzing}
              >
                {isAnalyzing ? '分析中...' : 'AI 分析'}
              </Button>
            )}
          </Space>
        )}
      </Flex>
    </div>
  );
};

export default DocumentUploader;
