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
    message,
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
}

interface UploadResult {
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
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': <FileWordOutlined style={{ color: '#1890ff' }} />,
    'application/vnd.ms-excel': <FileExcelOutlined style={{ color: '#52c41a' }} />,
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': <FileExcelOutlined style={{ color: '#52c41a' }} />,
    'image/jpeg': <PictureOutlined style={{ color: '#722ed1' }} />,
    'image/png': <PictureOutlined style={{ color: '#722ed1' }} />,
    'text/plain': <FileTextOutlined style={{ color: '#8c8c8c' }} />,
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
}) => {
    const { token } = theme.useToken();
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
        <Card>
            <Title level={4} style={{ marginBottom: 24 }}>
                <FileTextOutlined style={{ marginRight: 8, color: token.colorPrimary }} />
                文档上传
            </Title>

            {/* 上传区域 */}
            {!uploadResult && fileList.length === 0 && (
                <Dragger {...uploadProps} style={{ marginBottom: 24 }}>
                    <p className="ant-upload-drag-icon">
                        <InboxOutlined style={{ color: token.colorPrimary, fontSize: 48 }} />
                    </p>
                    <p className="ant-upload-text">
                        点击或拖拽文件到此区域上传
                    </p>
                    <p className="ant-upload-hint" style={{ color: token.colorTextSecondary }}>
                        支持 PDF、Word、Excel、图片（JPG/PNG）
                    </p>
                    <Flex justify="center" gap={8} style={{ marginTop: 16 }}>
                        <Tag icon={<FilePdfOutlined />}>PDF</Tag>
                        <Tag icon={<FileWordOutlined />}>Word</Tag>
                        <Tag icon={<FileExcelOutlined />}>Excel</Tag>
                        <Tag icon={<PictureOutlined />}>图片</Tag>
                    </Flex>
                </Dragger>
            )}

            {/* 文件预览 */}
            {fileList.length > 0 && !uploadResult && (
                <Card
                    size="small"
                    style={{
                        marginBottom: 24,
                        background: token.colorBgContainerDisabled,
                    }}
                >
                    <Flex align="center" justify="space-between">
                        <Flex align="center" gap={12}>
                            <div style={{ fontSize: 32 }}>
                                {MIME_TYPE_ICONS[fileList[0].type || ''] || <FileTextOutlined />}
                            </div>
                            <div>
                                <Text strong>{fileList[0].name}</Text>
                                <br />
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    {formatFileSize(fileList[0].size || 0)}
                                </Text>
                            </div>
                        </Flex>
                        <Button
                            type="text"
                            danger
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
                    message="文档上传成功"
                    description={
                        <Descriptions size="small" column={1} style={{ marginTop: 8 }}>
                            <Descriptions.Item label="文件名">
                                {uploadResult.attachment.filename}
                            </Descriptions.Item>
                            <Descriptions.Item label="文件大小">
                                {formatFileSize(uploadResult.attachment.fileSize)}
                            </Descriptions.Item>
                            <Descriptions.Item label="情报ID">
                                <Text copyable={{ text: uploadResult.intel.id }}>
                                    {uploadResult.intel.id.substring(0, 8)}...
                                </Text>
                            </Descriptions.Item>
                        </Descriptions>
                    }
                    style={{ marginBottom: 24 }}
                />
            )}

            {/* 操作按钮 */}
            <Flex justify="flex-end" gap={12}>
                {onCancel && !uploadResult && (
                    <Button onClick={onCancel}>
                        取消
                    </Button>
                )}
                {!uploadResult ? (
                    <Button
                        type="primary"
                        onClick={handleUpload}
                        loading={uploading}
                        disabled={fileList.length === 0}
                        icon={uploading ? <LoadingOutlined /> : undefined}
                    >
                        {uploading ? '上传中...' : '上传文档'}
                    </Button>
                ) : (
                    <Space>
                        <Button
                            onClick={() => {
                                setFileList([]);
                                setUploadResult(null);
                            }}
                        >
                            继续上传
                        </Button>
                        {onViewDetail && (
                            <Button onClick={() => onViewDetail(uploadResult.intel.id)}>
                                查看详情
                            </Button>
                        )}
                        {onStartAnalysis && uploadResult.intel.rawContent && (
                            <Button
                                type="primary"
                                onClick={() => onStartAnalysis(uploadResult.intel.rawContent)}
                            >
                                开始 AI 分析
                            </Button>
                        )}
                    </Space>
                )}
            </Flex>
        </Card>
    );
};

export default DocumentUploader;
