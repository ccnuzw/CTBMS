import React, { useMemo, useState } from 'react';
import { Card, Empty, Button, Result, Segmented, Select, theme } from 'antd';
import {
  FilePdfOutlined,
  FileWordOutlined,
  FilePptOutlined,
  FileExcelOutlined,
  DownloadOutlined,
} from '@ant-design/icons';
import TiptapEditor from '@/components/TiptapEditor';

interface PreviewAttachment {
  id: string;
  filename?: string;
  fileName?: string;
  mimeType?: string;
}

interface DocumentPreviewProps {
  fileUrl?: string; // Currently we might not have a direct fileUrl in report model, usually fetched via attachment
  fileName?: string;
  mimeType?: string;
  content?: string;
  // For now we will use a placeholder or handle attachments if passed
  onDownload?: () => void;
  view?: 'content' | 'original';
  onViewChange?: (view: 'content' | 'original') => void;
  attachments?: PreviewAttachment[];
  selectedAttachmentId?: string;
  onAttachmentChange?: (id: string) => void;
  contentLabel?: string;
  originalLabel?: string;
}

export const DocumentPreview: React.FC<DocumentPreviewProps> = ({
  fileUrl,
  fileName,
  mimeType,
  content,
  onDownload,
  view,
  onViewChange,
  attachments,
  selectedAttachmentId,
  onAttachmentChange,
  contentLabel,
  originalLabel,
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
    return (
      /\.(doc|docx|ppt|pptx)$/i.test(fileName || '') ||
      mimeType?.includes('word') ||
      mimeType?.includes('presentation') ||
      mimeType?.includes('powerpoint')
    );
  }, [fileUrl, fileName, mimeType]);

  const isExcel = useMemo(() => {
    if (!fileUrl) return false;
    return /\.(xls|xlsx)$/i.test(fileName || '') || mimeType?.includes('spreadsheet');
  }, [fileUrl, fileName, mimeType]);

  const isPdf = useMemo(() => {
    return mimeType === 'application/pdf' || fileName?.toLowerCase().endsWith('.pdf');
  }, [mimeType, fileName]);

  const isImage = useMemo(() => {
    if (!fileUrl) return false;
    return mimeType?.startsWith('image/') || /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(fileName || '');
  }, [fileUrl, fileName, mimeType]);

  const attachmentOptions = useMemo(() => {
    return (attachments || []).map((att) => ({
      label: att.filename || att.fileName || '未命名附件',
      value: att.id,
    }));
  }, [attachments]);

  const allowAttachmentSelect = attachmentOptions.length > 1 && !!onAttachmentChange;
  const contentLabelText = contentLabel || '正文提炼';
  const originalLabelText = originalLabel || '原始文档';

  return (
    <Card bordered={false} className="shadow-sm" bodyStyle={{ padding: 0 }}>
      <div
        style={{
          padding: '12px 16px',
          borderBottom: `1px solid ${token.colorBorderSecondary}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}
      >
        <Segmented
          value={activeView}
          onChange={(value) => handleViewChange(value as 'content' | 'original')}
          options={[
            { label: contentLabelText, value: 'content' },
            { label: originalLabelText, value: 'original' },
          ]}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {allowAttachmentSelect && (
            <Select
              size="small"
              style={{ minWidth: 180 }}
              value={selectedAttachmentId}
              options={attachmentOptions}
              onChange={onAttachmentChange}
            />
          )}
          {fileUrl && (
            <Button size="small" icon={<DownloadOutlined />} onClick={onDownload}>
              下载原文
            </Button>
          )}
        </div>
      </div>
      {activeView === 'content' && (
        <div style={{ padding: 24, height: '60vh', minHeight: 420, maxHeight: 720 }}>
          {content ? (
            <TiptapEditor value={content} readOnly={true} minHeight={0} />
          ) : (
            <Empty
              description={
                <span>
                  暂无正文内容
                  {fileUrl && (
                    <div style={{ marginTop: 8 }}>
                      <span style={{ color: token.colorTextSecondary }}>
                        未能提取到文本，请切换至“原始文档”查看
                      </span>
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
              {(isPdf || isImage) && (
                <iframe
                  src={fileUrl}
                  style={{ width: '100%', height: '760px', border: 'none' }}
                  title="Document Preview"
                />
              )}

              {(isOffice || isExcel) && (
                <div
                  style={{
                    height: '520px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexDirection: 'column',
                    background: token.colorFillQuaternary,
                    border: `1px dashed ${token.colorBorder}`,
                    borderRadius: 8,
                  }}
                >
                  <Result
                    icon={
                      fileName?.endsWith('ppt') || fileName?.endsWith('pptx') ? (
                        <FilePptOutlined style={{ color: token.colorError }} />
                      ) : fileName?.endsWith('xls') || fileName?.endsWith('xlsx') ? (
                        <FileExcelOutlined style={{ color: token.colorSuccess }} />
                      ) : (
                        <FileWordOutlined style={{ color: token.colorPrimary }} />
                      )
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

              {!isPdf && !isImage && !isOffice && !isExcel && (
                <Result
                  icon={<FilePdfOutlined style={{ color: token.colorTextSecondary }} />}
                  title="该格式暂不支持在线预览"
                  subTitle={fileName}
                  extra={
                    <Button type="primary" icon={<DownloadOutlined />} onClick={onDownload}>
                      下载文件查看
                    </Button>
                  }
                />
              )}
            </>
          ) : (
            <Empty
              image={
                <FilePdfOutlined style={{ fontSize: 60, color: token.colorBorderSecondary }} />
              }
              description={
                <span>
                  暂无原始文档
                  <br />
                  <small style={{ color: token.colorTextSecondary }}>
                    仅有正文内容或文档未上传
                  </small>
                </span>
              }
            />
          )}
        </div>
      )}
    </Card>
  );
};
