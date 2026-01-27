import React, { useState } from 'react';
import {
    ProForm,
    ProFormText,
    ProFormSelect,
    ProFormUploadButton,
} from '@ant-design/pro-components';
import { PageContainer } from '@ant-design/pro-components';
import { Card, Button, UploadFile, App, Grid, Flex, Space, theme } from 'antd';
import { FilePdfOutlined, FileWordOutlined, FileExcelOutlined, FilePptOutlined, FileOutlined, SaveOutlined, CloseOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import { TiptapEditor } from '../../../components/TiptapEditor';
import { useCategories } from '../api/categories';
import { useGlobalTags } from '../../tags/api/tags';
import { useCreateInfo, useUpdateInfo } from '../api/info';
import { CreateInfoDto, InfoStatus, TagScope } from '@packages/types';
import { apiClient } from '../../../api/client';

export const InfoEditor: React.FC = () => {
    const navigate = useNavigate();
    const { id } = useParams<{ id: string }>();
    const isEdit = !!id && id !== 'new';
    const { message } = App.useApp();
    const screens = Grid.useBreakpoint();

    const { data: categories } = useCategories();
    // 使用全局标签 API，过滤 MARKET_INFO 作用域的标签
    const { data: tags } = useGlobalTags({ scope: TagScope.MARKET_INFO });
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
        // 前端互斥标签校验
        if (values.tagIds && values.tagIds.length > 0 && tags) {
            const selectedTags = tags.filter(t => values.tagIds.includes(t.id));
            const exclusiveGroups = new Map<string, string>(); // groupId -> tagName

            for (const tag of selectedTags) {
                if (tag.group && tag.group.isExclusive) {
                    if (exclusiveGroups.has(tag.group.id)) {
                        const existingTagName = exclusiveGroups.get(tag.group.id);
                        message.error(`标签组 "${tag.group.name}" 是互斥的，不能同时选择 "${existingTagName}" 和 "${tag.name}"`);
                        return; // 中止提交
                    }
                    exclusiveGroups.set(tag.group.id, tag.name);
                }
            }
        }

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
        } catch (error: any) {
            // 提取并显示后端返回的具体错误信息
            const errorMsg = error.response?.data?.message;
            if (errorMsg) {
                message.error(Array.isArray(errorMsg) ? errorMsg.join('; ') : errorMsg);
            } else {
                message.error('保存失败');
            }
        }
    };

    // 等待 initialValues 准备好再渲染表单
    // Removed loading check


    const { token: antdToken } = theme.useToken();
    const isMobile = !screens.md;

    return (
        <PageContainer
            title={!isMobile ? (isEdit ? '编辑信息' : '新建信息') : undefined}
            header={isMobile ? { title: undefined, breadcrumb: undefined } : undefined}
            style={isMobile ? { padding: 0, margin: 0 } : undefined}
        >
            <Card
                bordered={!isMobile}
                style={isMobile ? {
                    borderRadius: 0,
                    boxShadow: 'none',
                    margin: 0
                } : undefined}
                bodyStyle={isMobile ? { padding: '12px' } : undefined}
            >
                <ProForm
                    key={isEdit ? id : 'new'}
                    request={loadData}
                    onFinish={handleFinish}
                    layout="vertical"
                    grid={isMobile}
                    colProps={isMobile ? { span: 24 } : undefined}
                    submitter={{
                        render: (props, dom) => {
                            if (isMobile) {
                                // 移动端：底部固定按钮栏
                                return (
                                    <div
                                        style={{
                                            position: 'sticky',
                                            bottom: 0,
                                            left: 0,
                                            right: 0,
                                            padding: '12px 16px',
                                            background: antdToken.colorBgContainer,
                                            borderTop: `1px solid ${antdToken.colorBorderSecondary}`,
                                            marginLeft: -12,
                                            marginRight: -12,
                                            marginBottom: -12,
                                            zIndex: 100,
                                        }}
                                    >
                                        <Flex gap={8}>
                                            <Button
                                                block
                                                size="large"
                                                icon={<CloseOutlined />}
                                                onClick={() => navigate('/market/info')}
                                            >
                                                取消
                                            </Button>
                                            <Button
                                                block
                                                type="primary"
                                                size="large"
                                                icon={<SaveOutlined />}
                                                onClick={() => props.form?.submit()}
                                                loading={props.submitButtonProps && typeof props.submitButtonProps !== 'boolean' ? props.submitButtonProps.loading : false}
                                            >
                                                保存
                                            </Button>
                                        </Flex>
                                    </div>
                                );
                            }
                            // 桌面端：默认布局
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
                        colProps={isMobile ? { span: 24 } : undefined}
                        fieldProps={{
                            size: isMobile ? 'large' : 'middle',
                        }}
                    />

                    <ProFormSelect
                        name="categoryId"
                        label="分类"
                        options={categories?.map(c => ({ label: c.name, value: c.id }))}
                        rules={[{ required: true, message: '请选择分类' }]}
                        colProps={isMobile ? { span: 24 } : undefined}
                        fieldProps={{
                            size: isMobile ? 'large' : 'middle',
                        }}
                    />

                    <ProFormSelect
                        name="tagIds"
                        label="标签"
                        mode="multiple"
                        options={tags?.map(t => ({ label: t.name, value: t.id }))}
                        colProps={isMobile ? { span: 24 } : undefined}
                        fieldProps={{
                            size: isMobile ? 'large' : 'middle',
                        }}
                    />

                    <ProFormSelect
                        name="status"
                        label="状态"
                        valueEnum={{
                            DRAFT: '草稿',
                            PUBLISHED: '发布',
                            ARCHIVED: '归档'
                        }}
                        colProps={isMobile ? { span: 24 } : undefined}
                        fieldProps={{
                            size: isMobile ? 'large' : 'middle',
                        }}
                    />

                    <div style={{ marginBottom: isMobile ? 80 : 24 }}>
                        <label
                            style={{
                                display: 'block',
                                marginBottom: 8,
                                fontSize: isMobile ? 16 : 14,
                                fontWeight: isMobile ? 500 : 400,
                            }}
                        >
                            内容详情
                        </label>
                        <TiptapEditor
                            value={content}
                            onChange={setContent}
                            placeholder="请输入内容详情..."
                            minHeight={isMobile ? 250 : 350}
                            isMobile={isMobile}
                        />
                    </div>

                    <ProFormUploadButton
                        name="attachments"
                        label="附件"
                        title="上传文件"
                        max={10}
                        fileList={fileList}
                        onChange={({ fileList }) => setFileList(fileList)}
                        action="http://localhost:3000/market/info/upload"
                        colProps={isMobile ? { span: 24 } : undefined}
                        fieldProps={{
                            name: 'file',
                            listType: isMobile ? 'picture-card' : 'picture',
                            onPreview: (file) => {
                                const url = file.url || file.response?.url;
                                if (!url) return;

                                const ext = file.name.split('.').pop()?.toLowerCase();

                                if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'].includes(ext || '')) {
                                    window.open(url, '_blank');
                                    return;
                                }

                                if (ext === 'pdf') {
                                    window.open(url, '_blank');
                                    return;
                                }

                                if (['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx'].includes(ext || '')) {
                                    window.open(`https://docs.google.com/viewer?url=${encodeURIComponent(url)}&embedded=true`, '_blank');
                                    return;
                                }

                                window.open(url, '_blank');
                            },
                        }}
                    />

                </ProForm>
            </Card>
        </PageContainer>
    );
};
