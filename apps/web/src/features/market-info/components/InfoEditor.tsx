import React, { useState } from 'react';
import {
    ProForm,
    ProFormText,
    ProFormSelect,
    ProFormUploadButton,
} from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Button, UploadFile, App } from 'antd';
import { FilePdfOutlined, FileWordOutlined, FileExcelOutlined, FilePptOutlined, FileOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import { useCategories } from '../api/categories';
import { useTags } from '../api/tags';
import { useCreateInfo, useUpdateInfo } from '../api/info';
import { CreateInfoDto, InfoStatus } from '@packages/types';
import { apiClient } from '../../../api/client';

export const InfoEditor: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEdit = !!id && id !== 'new';
    const { message } = App.useApp();

    const { data: categories } = useCategories();
    const { data: tags } = useTags();
    // const { data: infoData, isLoading: isInfoLoading } = useInfo(id || ''); // Removed to avoid double fetch


    const createInfo = useCreateInfo();
    const updateInfo = useUpdateInfo();

    const [content, setContent] = useState('');
    const [fileList, setFileList] = useState<UploadFile[]>([]);

    // 获取文件类型图标
    const getFileIcon = (filename: string): string => {
        const ext = filename.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'pdf':
                return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjZTUzOTM1Ij48cGF0aCBkPSJNMjAgMkgxMGMtMS4xMDMgMC0yIC44OTctMiAydjEySDE0bDIgMlYyMGg0YzEuMTAzIDAgMi0uODk3IDItMlY0YzAtMS4xMDMtLjg5Ny0yLTItMnptLTkgNi41YzAtLjI3NS4yMjUtLjUuNS0uNWgzYy4yNzUgMCAuNS4yMjUuNS41cy0uMjI1LjUtLjUuNWgtM2MtLjI3NSAwLS41LS4yMjUtLjUtLjV6bTYgNWMwIC4yNzUtLjIyNS41LS41LjVoLTVjLS4yNzUgMC0uNS0uMjI1LS41LS41cy4yMjUtLjUuNS0uNWg1Yy4yNzUgMCAuNS4yMjUuNS41em0wLTJjMCAuMjc1LS4yMjUuNS0uNS41aC01Yy0uMjc1IDAtLjUtLjIyNS0uNS0uNXMuMjI1LS41LjUtLjVoNWMuMjc1IDAgLjUuMjI1LjUuNXoiLz48L3N2Zz4=';
            case 'doc':
            case 'docx':
                return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjMTk3NmQyIj48cGF0aCBkPSJNMjAgMkgxMGMtMS4xMDMgMC0yIC44OTctMiAydjEySDE0bDIgMlYyMGg0YzEuMTAzIDAgMi0uODk3IDItMlY0YzAtMS4xMDMtLjg5Ny0yLTItMnptLTkgNi41YzAtLjI3NS4yMjUtLjUuNS0uNWgzYy4yNzUgMCAuNS4yMjUuNS41cy0uMjI1LjUtLjUuNWgtM2MtLjI3NSAwLS41LS4yMjUtLjUtLjV6bTYgNWMwIC4yNzUtLjIyNS41LS41LjVoLTVjLS4yNzUgMC0uNS0uMjI1LS41LS41cy4yMjUtLjUuNS0uNWg1Yy4yNzUgMCAuNS4yMjUuNS41em0wLTJjMCAuMjc1LS4yMjUuNS0uNS41aC01Yy0uMjc1IDAtLjUtLjIyNS0uNS0uNXMuMjI1LS41LjUtLjVoNWMuMjc1IDAgLjUuMjI1LjUuNXoiLz48L3N2Zz4=';
            case 'xls':
            case 'xlsx':
                return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjNGNhZjUwIj48cGF0aCBkPSJNMjAgMkgxMGMtMS4xMDMgMC0yIC44OTctMiAydjEySDE0bDIgMlYyMGg0YzEuMTAzIDAgMi0uODk3IDItMlY0YzAtMS4xMDMtLjg5Ny0yLTItMnptLTkgNi41YzAtLjI3NS4yMjUtLjUuNS0uNWgzYy4yNzUgMCAuNS4yMjUuNS41cy0uMjI1LjUtLjUuNWgtM2MtLjI3NSAwLS41LS4yMjUtLjUtLjV6bTYgNWMwIC4yNzUtLjIyNS41LS41LjVoLTVjLS4yNzUgMC0uNS0uMjI1LS41LS41cy4yMjUtLjUuNS0uNWg1Yy4yNzUgMCAuNS4yMjUuNS41em0wLTJjMCAuMjc1LS4yMjUuNS0uNS41aC01Yy0uMjc1IDAtLjUtLjIyNS0uNS0uNXMuMjI1LS41LjUtLjVoNWMuMjc1IDAgLjUuMjI1LjUuNXoiLz48L3N2Zz4=';
            case 'ppt':
            case 'pptx':
                return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjZmY5ODAwIj48cGF0aCBkPSJNMjAgMkgxMGMtMS4xMDMgMC0yIC44OTctMiAydjEySDE0bDIgMlYyMGg0YzEuMTAzIDAgMi0uODk3IDItMlY0YzAtMS4xMDMtLjg5Ny0yLTItMnptLTkgNi41YzAtLjI3NS4yMjUtLjUuNS0uNWgzYy4yNzUgMCAuNS4yMjUuNS41cy0uMjI1LjUtLjUuNWgtM2MtLjI3NSAwLS41LS4yMjUtLjUtLjV6bTYgNWMwIC4yNzUtLjIyNS41LS41LjVoLTVjLS4yNzUgMC0uNS0uMjI1LS41LS41cy4yMjUtLjUuNS0uNWg1Yy4yNzUgMCAuNS4yMjUuNS41em0wLTJjMCAuMjc1LS4yMjUuNS0uNS41aC01Yy0uMjc1IDAtLjUtLjIyNS0uNS0uNXMuMjI1LS41LjUtLjVoNWMuMjc1IDAgLjUuMjI1LjUuNXoiLz48L3N2Zz4=';
            default:
                return 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0OCIgaGVpZ2h0PSI0OCIgdmlld0JveD0iMCAwIDI0IDI0IiBmaWxsPSIjOTk5Ij48cGF0aCBkPSJNMjAgMkgxMGMtMS4xMDMgMC0yIC44OTctMiAydjEySDE0bDIgMlYyMGg0YzEuMTAzIDAgMi0uODk3IDItMlY0YzAtMS4xMDMtLjg5Ny0yLTItMnptLTkgNi41YzAtLjI3NS4yMjUtLjUuNS0uNWgzYy4yNzUgMCAuNS4yMjUuNS41cy0uMjI1LjUtLjUuNWgtM2MtLjI3NSAwLS41LS4yMjUtLjUtLjV6bTYgNWMwIC4yNzUtLjIyNS41LS41LjVoLTVjLS4yNzUgMC0uNS0uMjI1LS41LS41cy4yMjUtLjUuNS0uNWg1Yy4yNzUgMCAuNS4yMjUuNS41em0wLTJjMCAuMjc1LS4yMjUuNS0uNS41aC01Yy0uMjc1IDAtLjUtLjIyNS0uNS0uNXMuMjI1LS41LjUtLjVoNWMuMjc1IDAgLjUuMjI1LjUuNXoiLz48L3N2Zz4=';
        }
    };

    // 判断是否为图片文件
    const isImageFile = (filename: string): boolean => {
        const ext = filename.split('.').pop()?.toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext || '');
    };

    // Removed useEffect for infoData
    // Removed initialValues useMemo

    const loadData = async () => {
        if (!isEdit || !id) {
            return { status: InfoStatus.DRAFT };
        }

        try {
            const res = await apiClient.get<any>(`/market/info/${id}`);
            const data = res.data;

            setContent(data.content);

            if (data.attachments && Array.isArray(data.attachments)) {
                const attachments = data.attachments as Array<{ name: string; url: string; size?: number }>;
                const files: UploadFile[] = attachments.map((att, index) => ({
                    uid: `${index}-${att.name}`,
                    name: att.name,
                    status: 'done' as const,
                    url: att.url,
                    size: att.size,
                    thumbUrl: isImageFile(att.name) ? att.url : getFileIcon(att.name),
                }));
                setFileList(files);
            }

            return {
                ...data,
                tagIds: data.tags?.map((t: any) => t.id)
            };
        } catch (e) {
            message.error('加载失败');
            return {};
        }
    };

    const handleFinish = async (values: any) => {
        const payload: CreateInfoDto = {
            title: values.title,
            content: content,
            categoryId: values.categoryId,
            tagIds: values.tagIds,
            status: values.status || InfoStatus.DRAFT,
            attachments: fileList.map(f => ({
                name: f.name,
                url: f.response?.url || f.url || '',
                size: f.size
            })),
            summary: values.summary
        };

        try {
            if (isEdit && id) {
                await updateInfo.mutateAsync({ id, data: payload });
                message.success('更新成功');
            } else {
                await createInfo.mutateAsync(payload);
                message.success('创建成功');
            }
            navigate('/market/info');
        } catch (error) {
            // Error handled by interceptor
        }
    };

    // 等待 initialValues 准备好再渲染表单
    // Removed loading check


    return (
        <PageContainer title={isEdit ? '编辑信息' : '新建信息'}>
            <Card>
                <ProForm
                    key={isEdit ? id : 'new'}
                    request={loadData}
                    onFinish={handleFinish}
                    submitter={{
                        render: (props, dom) => {
                            return [
                                <Button key="cancel" onClick={() => navigate('/market/info')}>
                                    取消
                                </Button>,
                                ...dom,
                            ];
                        },
                    }}
                >
                    <ProFormText
                        name="title"
                        label="标题"
                        placeholder="请输入标题"
                        rules={[{ required: true, message: '请输入标题' }]}
                    />

                    <ProFormSelect
                        name="categoryId"
                        label="分类"
                        options={categories?.map(c => ({ label: c.name, value: c.id }))}
                        rules={[{ required: true, message: '请选择分类' }]}
                    />

                    <ProFormSelect
                        name="tagIds"
                        label="标签"
                        mode="multiple"
                        options={tags?.map(t => ({ label: t.name, value: t.id }))}
                    // Initial values transformation might be needed if infoData.tags is object array
                    // ProForm handles this if name matches, but we need to map objects to IDs for initial value
                    // Handled by `initialValues` transform usually, simpler to just rely on user re-selecting for MVP or basic map
                    />

                    <ProFormSelect
                        name="status"
                        label="状态"
                        valueEnum={{
                            DRAFT: '草稿',
                            PUBLISHED: '发布',
                            ARCHIVED: '归档'
                        }}
                    />

                    <div style={{ marginBottom: 24 }}>
                        <label style={{ display: 'block', marginBottom: 8 }}>内容详情</label>
                        <ReactQuill
                            theme="snow"
                            value={content}
                            onChange={setContent}
                            style={{ height: 300, marginBottom: 50 }}
                        />
                    </div>

                    <ProFormUploadButton
                        name="attachments"
                        label="附件"
                        title="上传文件"
                        fileList={fileList}
                        onChange={({ fileList }) => setFileList(fileList)}
                        action="http://localhost:3000/market/info/upload"
                        fieldProps={{
                            name: 'file',
                            listType: 'picture',
                            onPreview: (file) => {
                                const url = file.url || file.response?.url;
                                if (!url) return;

                                // 获取文件扩展名
                                const ext = file.name.split('.').pop()?.toLowerCase();

                                // 图片直接预览
                                if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
                                    window.open(url, '_blank');
                                    return;
                                }

                                // PDF 使用浏览器内置预览
                                if (ext === 'pdf') {
                                    window.open(url, '_blank');
                                    return;
                                }

                                // Office 文件使用 Google Docs Viewer
                                if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '')) {
                                    window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`, '_blank');
                                    return;
                                }

                                // 其他文件直接下载
                                window.open(url, '_blank');
                            },
                        }}
                    />

                </ProForm>
            </Card>
        </PageContainer >
    );
};
