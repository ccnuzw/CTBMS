
import React, { useMemo, useState } from 'react';
import { Card, Empty, Button, Result, Segmented, theme } from 'antd';
import { FilePdfOutlined, FileWordOutlined, FilePptOutlined, DownloadOutlined } from '@ant-design/icons';
import TiptapEditor from '@/components/TiptapEditor';

interface DocumentPreviewProps {
    fileUrl?: string; // Currently we might not have a direct fileUrl in report model, usually fetched via attachment
    fileName?: string;
    mimeType?: string;
    content?: string;
    // For now we will use a placeholder or handle attachments if passed
    onDownload?: () => void;
    view?: 'content' | 'original';
    onViewChange?: (view: 'content' | 'original') => void;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
    fileUrl,
    fileName,
    mimeType,
    content,
    onDownload,
    view,
    onViewChange,
}) => {
    const { token } = theme.useToken();
    const [innerView, setInnerView] = useState<'content' | 'original'>(view || 'content');
    const activeView = view || innerView;

    const handleViewChange = (nextView: 'content' | 'original') => {
        if (onViewChange) {
            onViewChange(nextView);
            return;
        }
        setInnerView(nextView);
    };

    const isOffice = useMemo(() => {
        if (!fileUrl) return false;
        return /\.(doc|docx|ppt|pptx)$/i.test(fileName || '') ||
            mimeType?.includes('word') ||
            mimeType?.includes('presentation') ||
            mimeType?.includes('powerpoint');
    }, [fileUrl, fileName, mimeType]);

    const isPdf = useMemo(() => {
        return mimeType === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf');
    }, [mimeType, fileName]);

    return (
        <Card bordered={false} className="shadow-sm" bodyStyle={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Segmented
                    value={activeView}
                    onChange={(value) => handleViewChange(value as 'content' | 'original')}
                    options={[
                        { label: '正文提炼', value: 'content' },
                        { label: '原始文档', value: 'original' },
                    ]}
                />
                {fileUrl && (
                    <Button size="small" icon={<DownloadOutlined />} onClick={onDownload}>
                        下载原文
                    </Button>
                )}
            </div>
            {activeView === 'content' && (
                <div style={{ padding: 24, height: '60vh', minHeight: 420, maxHeight: 720 }}>
                    {content ? (
                        <TiptapEditor
                            value={content}
                            readOnly={true}
                            minHeight={0}
                        />
                    ) : (
                        <Empty
                            description={
                                <span>
                                    暂无正文内容
                                    {fileUrl && (
                                        <div style={{ marginTop: 8 }}>
                                            <span style={{ color: '#8c8c8c' }}>未能提取到文本，请切换至“原始文档”查看</span>
                                        </div>
                                    )}
                                </span>
                            }
                        />
                    )}
                </div>
            )}
            {activeView === 'original' && (
                <div style={{ padding: 24 }}>
                    {fileUrl ? (
                        <>
                            {(isPdf || !isOffice) && (
                                <iframe
                                    src={fileUrl}
                                    style={{ width: '100%', height: '760px', border: 'none' }}
                                    title="Document Preview"
                                />
                            )}

                            {isOffice && (
                                <div style={{
                                    height: '520px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    flexDirection: 'column',
                                    background: token.colorFillQuaternary,
                                    border: `1px dashed ${token.colorBorder}`,
                                    borderRadius: 8
                                }}>
                                    <Result
                                        icon={fileName?.endsWith('ppt') || fileName?.endsWith('pptx')
                                            ? <FilePptOutlined style={{ color: token.colorError }} />
                                            : <FileWordOutlined style={{ color: token.colorPrimary }} />
                                        }
                                        title="Office 文档暂不支持在线预览"
                                        subTitle={fileName}
                                        extra={
                                            <Button type="primary" icon={<DownloadOutlined />} onClick={onDownload}>
                                                下载文档查看
                                            </Button>
                                        }
                                    />
                                </div>
                            )}
                        </>
                    ) : (
                        <Empty
                            image={<FilePdfOutlined style={{ fontSize: 60, color: token.colorBorderSecondary }} />}
                            description={
                                <span>
                                    暂无原始文档
                                    <br />
                                    <small style={{ color: token.colorTextSecondary }}>仅有正文内容或文档未上传</small>
                                </span>
                            }
                        />
                    )}
                </div>
            )}
        </Card>
    );
};
