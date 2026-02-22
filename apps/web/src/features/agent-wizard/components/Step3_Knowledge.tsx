
import React, { useState } from 'react';
import { Upload, Button, message, List, Typography, Space, Card } from 'antd';
import { InboxOutlined, FileTextOutlined, DeleteOutlined } from '@ant-design/icons';
import type { UploadProps } from 'antd';

const { Dragger } = Upload;
const { Title, Paragraph, Text } = Typography;

interface Step3Props {
    onSubmit: (fileIds: string[]) => void;
    onBack: () => void;
    files: string[];
}

export const Step3_Knowledge = ({ onSubmit, onBack, files }: Step3Props) => {
    const [fileList, setFileList] = useState<string[]>(files || []);

    const props: UploadProps = {
        name: 'file',
        multiple: true,
        action: '/api/knowledge/upload',
        onChange(info) {
            const { status } = info.file;
            if (status === 'done') {
                message.success(`${info.file.name} file uploaded successfully.`);
                const fileId = (info.file.response as any)?.id;
                if (fileId && fileList.indexOf(fileId) === -1) {
                    setFileList(prev => [...prev, fileId]);
                }
            } else if (status === 'error') {
                message.error(`${info.file.name} file upload failed.`);
            }
        },
        onDrop() {
            // Drop handled by Upload component
        },
        showUploadList: false // We use custom list
    };

    const handleRemove = (id: string) => {
        setFileList(prev => prev.filter(f => f !== id));
    };

    return (
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
            <div style={{ textAlign: 'center', marginBottom: 40 }}>
                <Title level={2}>Upload Knowledge Base</Title>
                <Paragraph type="secondary">
                    Provide documents (PDF, Markdown, Text) for your agent to learn from.
                </Paragraph>
            </div>

            <Dragger {...props} style={{ padding: 40, background: '#fafafa', border: '2px dashed #d9d9d9' }}>
                <p className="ant-upload-drag-icon">
                    <InboxOutlined style={{ fontSize: 48, color: '#1890ff' }} />
                </p>
                <p className="ant-upload-text">Click or drag file to this area to upload</p>
                <p className="ant-upload-hint">
                    Support for a single or bulk upload. Strictly prohibited from uploading company data or other banned files.
                </p>
            </Dragger>

            <div style={{ marginTop: 24 }}>
                <List
                    header={<Text strong>Uploaded Files ({fileList.length})</Text>}
                    bordered
                    dataSource={fileList}
                    renderItem={item => (
                        <List.Item
                            actions={[<Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemove(item)} />]}
                        >
                            <List.Item.Meta
                                avatar={<FileTextOutlined style={{ fontSize: 20, color: '#1890ff' }} />}
                                title={item}
                                description="Processed & Indexed"
                            />
                        </List.Item>
                    )}
                />
            </div>

            <div style={{ marginTop: 40, textAlign: 'center' }}>
                <Space>
                    <Button onClick={onBack}>Back</Button>
                    <Button type="primary" size="large" onClick={() => onSubmit(fileList)} style={{ width: 120 }}>Next</Button>
                </Space>
            </div>
        </div>
    );
};
