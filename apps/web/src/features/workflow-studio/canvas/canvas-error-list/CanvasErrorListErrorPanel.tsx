import React from 'react';
import { Card, Badge, Button, Space, Typography, Select, Alert, List, Tooltip, theme } from 'antd';
import { WarningOutlined, UpOutlined, DownOutlined, AimOutlined } from '@ant-design/icons';
import { CanvasErrorListProps } from './types';
import { extractIssueCode, summarizeIds, VALIDATION_GUIDANCE_MAP } from './utils';
import { useCanvasErrorListViewModel } from './useCanvasErrorListViewModel';

const { Text } = Typography;

interface Props extends CanvasErrorListProps {
    viewModel: ReturnType<typeof useCanvasErrorListViewModel>;
}

export const CanvasErrorListErrorPanel: React.FC<Props> = ({
    errors,
    onFocusNode,
    onFocusEdge,
    onAutoFix,
    autoFixEnabled,
    onStepAutoFix,
    stepAutoFixLoading,
    stepAutoFixEnabled,
    stepAutoFixReport,
    onClearStepAutoFixReport,
    onPreviewAutoFix,
    previewAutoFixLoading,
    previewAutoFixEnabled,
    autoFixPreview,
    onClearAutoFixPreview,
    autoFixCodeOptions,
    selectedAutoFixCodes,
    onSelectedAutoFixCodesChange,
    lastAutoFixActions,
    onClearAutoFixActions,
    viewModel
}) => {
    const { token } = theme.useToken();
    const {
        state: { expanded, errorCount, warningCount },
        actions: { setExpanded, openChangeDetail }
    } = viewModel;

    if (!expanded) {
        return (
            <Card
                size="small"
                bodyStyle={{ padding: '8px 12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                onClick={() => setExpanded(true)}
                style={{ boxShadow: token.boxShadowSecondary }}
            >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge count={errors.length} />
                    <span style={{ fontWeight: 500 }}>
                        校验问题
                        <Text type="secondary" style={{ marginLeft: 6 }}>{errorCount}错 / {warningCount}警告</Text>
                    </span>
                </div>
                <DownOutlined />
            </Card>
        );
    }

    return (
        <Card
            size="small"
            title={
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <Badge count={errors.length} showZero={false}>
                            <WarningOutlined style={{ color: token.colorError, fontSize: 16 }} />
                        </Badge>
                        <span style={{ marginLeft: 8 }}>校验问题</span>
                    </div>
                    <Button type="text" size="small" icon={<UpOutlined />} onClick={() => setExpanded(false)} />
                </div>
            }
            extra={onAutoFix || onPreviewAutoFix || onStepAutoFix ? (
                <Space size={6}>
                    {onPreviewAutoFix && <Button size="small" loading={previewAutoFixLoading} disabled={!previewAutoFixEnabled} onClick={onPreviewAutoFix}>预览修复</Button>}
                    {onStepAutoFix && <Button size="small" loading={stepAutoFixLoading} disabled={!stepAutoFixEnabled} onClick={onStepAutoFix}>分步修复</Button>}
                    {onAutoFix && <Button size="small" type="primary" disabled={!autoFixEnabled} onClick={onAutoFix}>一键修复</Button>}
                </Space>
            ) : null}
            bodyStyle={{ padding: 0, maxHeight: 400, overflowY: 'auto' }}
            style={{ boxShadow: token.boxShadowSecondary }}
        >
            {autoFixCodeOptions && autoFixCodeOptions.length > 0 && (
                <div style={{ padding: 8, borderBottom: `1px solid ${token.colorBorderSecondary}` }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>修复范围</Text>
                    <Select
                        mode="multiple" size="small" style={{ width: '100%', marginTop: 4 }}
                        value={selectedAutoFixCodes} onChange={(codes) => onSelectedAutoFixCodesChange?.(codes)}
                        placeholder="选择要修复的问题码" options={autoFixCodeOptions.map((code) => ({ label: code, value: code }))}
                    />
                </div>
            )}

            {stepAutoFixReport && (
                <Alert
                    type={stepAutoFixReport.finalIssueCount === 0 ? 'success' : 'info'} showIcon style={{ margin: 8 }}
                    message={`分步修复完成（${stepAutoFixReport.steps.length} 步），${stepAutoFixReport.finalIssueCount === 0 ? '当前无剩余问题' : `剩余 ${stepAutoFixReport.finalIssueCount} 项问题`}`}
                    action={<Space size={0}>{onClearStepAutoFixReport && <Button size="small" type="link" onClick={onClearStepAutoFixReport}>清除记录</Button>}</Space>}
                    description={
                        <Space direction="vertical" size={2}>
                            <Text type="secondary" style={{ fontSize: 12 }}>生成时间: {stepAutoFixReport.generatedAt}</Text>
                            {stepAutoFixReport.steps.map((step, i) => (
                                <Text key={`${step.title}-${i}`} type="secondary" style={{ fontSize: 12 }}>{i + 1}. {step.title} ({step.codes.join(', ')})，执行 {step.actions.length} 项，剩余 {step.remainingIssueCount} 项</Text>
                            ))}
                            {stepAutoFixReport.steps.map((step, i) => (
                                <Space key={`${step.title}-${i}-delta`} size={0} wrap>
                                    <Text type="secondary" style={{ fontSize: 12 }}>变更: 节点 +{step.changeSummary.addedNodeIds.length}/-{step.changeSummary.removedNodeIds.length}，连线 +{step.changeSummary.addedEdgeIds.length}/-{step.changeSummary.removedEdgeIds.length}，策略更新 {step.changeSummary.updatedRuntimePolicyNodeIds.length}</Text>
                                    <Button size="small" type="link" onClick={() => openChangeDetail(`${step.title} 变更详情`, step.changeSummary)}>查看详情</Button>
                                </Space>
                            ))}
                        </Space>
                    }
                />
            )}

            {autoFixPreview && (
                <Alert
                    type={autoFixPreview.remainingIssueCount === 0 ? 'success' : 'info'} showIcon style={{ margin: 8 }}
                    message={`预览结果：应用后预计${autoFixPreview.remainingIssueCount === 0 ? '无' : `剩余 ${autoFixPreview.remainingIssueCount} 项`}问题`}
                    action={
                        <Space size={0}>
                            <Button size="small" type="link" onClick={() => openChangeDetail('预览修复变更详情', autoFixPreview.changeSummary)}>查看详情</Button>
                            {onClearAutoFixPreview && <Button size="small" type="link" onClick={onClearAutoFixPreview}>清除预览</Button>}
                        </Space>
                    }
                    description={
                        <Space direction="vertical" size={2}>
                            <Text type="secondary" style={{ fontSize: 12 }}>生成时间: {autoFixPreview.generatedAt}</Text>
                            <Text type="secondary" style={{ fontSize: 12 }}>变更: 节点 +{autoFixPreview.changeSummary.addedNodeIds.length}/-{autoFixPreview.changeSummary.removedNodeIds.length}，连线 +{autoFixPreview.changeSummary.addedEdgeIds.length}/-{autoFixPreview.changeSummary.removedEdgeIds.length}，策略更新 {autoFixPreview.changeSummary.updatedRuntimePolicyNodeIds.length}</Text>
                            {autoFixPreview.changeSummary.addedNodeIds.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>新增节点: {summarizeIds(autoFixPreview.changeSummary.addedNodeIds)}</Text>}
                            {autoFixPreview.changeSummary.removedNodeIds.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>删除节点: {summarizeIds(autoFixPreview.changeSummary.removedNodeIds)}</Text>}
                            {autoFixPreview.changeSummary.addedEdgeIds.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>新增连线: {summarizeIds(autoFixPreview.changeSummary.addedEdgeIds)}</Text>}
                            {autoFixPreview.changeSummary.removedEdgeIds.length > 0 && <Text type="secondary" style={{ fontSize: 12 }}>删除连线: {summarizeIds(autoFixPreview.changeSummary.removedEdgeIds)}</Text>}
                            {autoFixPreview.actions.map((act, i) => <Text key={`${act}-${i}`} type="secondary" style={{ fontSize: 12 }}>{i + 1}. {act}</Text>)}
                        </Space>
                    }
                />
            )}

            {lastAutoFixActions && lastAutoFixActions.length > 0 && (
                <Alert
                    type="success" showIcon style={{ margin: 8 }}
                    message={`最近已自动修复 ${lastAutoFixActions.length} 项`}
                    action={onClearAutoFixActions && <Button size="small" type="link" onClick={onClearAutoFixActions}>清除记录</Button>}
                    description={<Space direction="vertical" size={2}>{lastAutoFixActions.map((act, i) => <Text key={`${act}-${i}`} type="secondary" style={{ fontSize: 12 }}>{act}</Text>)}</Space>}
                />
            )}

            <List
                size="small" dataSource={errors}
                renderItem={(item) => {
                    const issueCode = extractIssueCode(item.message);
                    const guidance = issueCode ? VALIDATION_GUIDANCE_MAP[issueCode] : undefined;
                    return (
                        <List.Item
                            actions={[
                                (item.nodeId || item.edgeId) && (
                                    <Tooltip title="定位到画布">
                                        <Button type="text" size="small" icon={<AimOutlined />} onClick={() => { if (item.nodeId) onFocusNode?.(item.nodeId); else if (item.edgeId) onFocusEdge?.(item.edgeId); }} />
                                    </Tooltip>
                                )
                            ].filter(Boolean) as React.ReactNode[]}
                        >
                            <List.Item.Meta
                                avatar={<WarningOutlined style={{ color: item.severity === 'WARNING' ? token.colorWarning : token.colorError }} />}
                                title={
                                    <Text style={{ fontSize: 13 }}>
                                        {item.nodeId ? `节点: ${item.nodeId}` : (item.edgeId ? `连线: ${item.edgeId}` : '全局问题')}
                                        {issueCode && <Text type="secondary" style={{ marginLeft: 6 }}>({issueCode})</Text>}
                                    </Text>
                                }
                                description={
                                    <Space direction="vertical" size={2}>
                                        <Text type="secondary" style={{ fontSize: 12 }}>{item.message}</Text>
                                        {guidance && <Text style={{ fontSize: 12, color: token.colorInfo }}>修复建议: {guidance}</Text>}
                                    </Space>
                                }
                            />
                        </List.Item>
                    );
                }}
            />
        </Card>
    );
};
