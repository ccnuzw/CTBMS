import React from 'react';
import { Button, Table, Tag, Popconfirm, App } from 'antd';
import { useMutation, useQuery } from '@tanstack/react-query';
import dayjs from 'dayjs';
import { apiClient, getErrorMessage } from '../../../api/client';

interface AgentPromptTemplateHistoryProps {
    templateId: string;
    onRollbackSuccess?: () => void;
}

export const AgentPromptTemplateHistory: React.FC<AgentPromptTemplateHistoryProps> = ({
    templateId,
    onRollbackSuccess,
}) => {
    const { message } = App.useApp();

    const { data: history, isLoading, refetch } = useQuery({
        queryKey: ['agent-prompt-template-history', templateId],
        queryFn: async () => {
            const { data } = await apiClient.get<any[]>(`/agent-prompt-templates/${templateId}/history`);
            return data;
        },
        enabled: !!templateId,
    });

    const rollbackMutation = useMutation({
        mutationFn: async (version: number) => {
            await apiClient.post(`/agent-prompt-templates/${templateId}/rollback/${version}`);
        },
        onSuccess: () => {
            message.success('回滚成功');
            refetch();
            onRollbackSuccess?.();
        },
        onError: (err) => {
            message.error(getErrorMessage(err) || '回滚失败');
        },
    });

    const columns = [
        {
            title: '版本',
            dataIndex: 'version',
            key: 'version',
            render: (v: number) => <Tag color="blue">v{v}</Tag>,
        },
        {
            title: '提示词编码',
            dataIndex: 'promptCode',
            key: 'promptCode',
        },
        {
            title: '创建时间',
            dataIndex: 'createdAt',
            key: 'createdAt',
            render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss'),
        },
        {
            title: '操作',
            key: 'action',
            render: (_: any, record: any) => (
                <Popconfirm
                    title={`确定回滚到版本 v${record.version}?`}
                    description="回滚后将生成一个新的版本，当前内容将被覆盖。"
                    onConfirm={() => rollbackMutation.mutateAsync(record.version)}
                    okText="回滚"
                    cancelText="取消"
                >
                    <Button type="link" danger disabled={rollbackMutation.isPending}>
                        回滚至此
                    </Button>
                </Popconfirm>
            ),
        },
    ];

    return (
        <Table
            dataSource={history || []}
            columns={columns}
            rowKey="id"
            loading={isLoading}
            pagination={{ pageSize: 5 }}
            size="small"
            expandable={{
                expandedRowRender: (record) => (
                    <div style={{ padding: 16, background: '#f5f5f5', borderRadius: 4 }}>
                        <p><strong>系统提示词：</strong></p>
                        <div style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                            {record.data.systemPrompt}
                        </div>
                        <p style={{ marginTop: 8 }}><strong>用户提示词：</strong></p>
                        <div style={{ whiteSpace: 'pre-wrap', maxHeight: 200, overflowY: 'auto' }}>
                            {record.data.userPromptTemplate}
                        </div>
                    </div>
                )
            }}
        />
    );
};
