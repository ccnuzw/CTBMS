import React, { useMemo } from 'react';
import { Form, Row, Col, Select, Button, Typography, Tooltip, Space, Divider, Tag, Modal, Input, theme } from 'antd';
import { FilterOutlined, SaveOutlined, EditOutlined, DeleteOutlined } from '@ant-design/icons';
import { ProCard } from '@ant-design/pro-components';
import dayjs from 'dayjs';
import { IntelTaskStatus, IntelTaskType, IntelTaskPriority, INTEL_TASK_PRIORITY_LABELS, INTEL_TASK_TYPE_LABELS } from '@packages/types';
import { INTEL_TASK_STATUS_LABELS } from '@/constants';
import { useTaskCalendarViewModel } from './useTaskCalendarViewModel';

const { Text } = Typography;

interface Props {
    viewModel: ReturnType<typeof useTaskCalendarViewModel>;
}

export const TaskCalendarFilterBar: React.FC<Props> = ({ viewModel }) => {
    const { token } = theme.useToken();
    const {
        state: { filters, selectedDate, savedFilters, selectedSavedFilterId, saveModalOpen, saveMode, saveName },
        refs: { form, saveModalContainerRef, saveNameInputRef, saveModalProps },
        actions: {
            handleFiltersChange, openAdvancedDrawer, handleFocusDate, handleFocusWeek, handleApplyPresetFilter,
            handleClearAll, handleApplySavedFilter, handleOpenSaveModal, handleOverwriteSavedFilter,
            handleDeleteSavedFilter, handleSaveFilters, setSaveModalOpen, setSaveName, setFilterValues
        },
        computed: { isFilterDirty },
        queries: { organizations, departments, users }
    } = viewModel;

    const handleClearField = (key: keyof typeof filters) => {
        const next = { ...filters };
        if (key === 'assigneeOrgId') {
            next.assigneeOrgId = undefined;
            next.assigneeDeptId = undefined;
            next.assigneeId = undefined;
        } else if (key === 'assigneeDeptId') {
            next.assigneeDeptId = undefined;
            next.assigneeId = undefined;
        } else {
            (next as any)[key] = undefined;
        }
        setFilterValues(next);
    };

    const chips = useMemo(() => {
        const result: Array<{ key: string; label: string; onClear: () => void }> = [];
        const orgName = organizations.find(o => o.id === filters.assigneeOrgId)?.name;
        const deptName = departments.find(d => d.id === filters.assigneeDeptId)?.name;
        const userName = users.find(u => u.id === filters.assigneeId)?.name;




        if (filters.assigneeOrgId) result.push({ key: 'assigneeOrgId', label: `组织: ${orgName || filters.assigneeOrgId}`, onClear: () => handleClearField('assigneeOrgId') });
        if (filters.assigneeDeptId) result.push({ key: 'assigneeDeptId', label: `部门: ${deptName || filters.assigneeDeptId}`, onClear: () => handleClearField('assigneeDeptId') });
        if (filters.assigneeId) result.push({ key: 'assigneeId', label: `负责人: ${userName || filters.assigneeId}`, onClear: () => handleClearField('assigneeId') });
        if (filters.type) result.push({ key: 'type', label: `类型: ${INTEL_TASK_TYPE_LABELS[filters.type]}`, onClear: () => handleClearField('type') });
        if (filters.priority) result.push({ key: 'priority', label: `优先级: ${INTEL_TASK_PRIORITY_LABELS[filters.priority]}`, onClear: () => handleClearField('priority') });
        if (filters.status) result.push({ key: 'status', label: `状态: ${INTEL_TASK_STATUS_LABELS[filters.status]}`, onClear: () => handleClearField('status') });
        if (filters.orgSummary) result.push({ key: 'orgSummary', label: '组织汇总', onClear: () => handleClearField('orgSummary') });
        if (filters.includePreview) result.push({ key: 'includePreview', label: '包含预览任务', onClear: () => handleClearField('includePreview') });

        return result;
    }, [filters, organizations, departments, users, handleClearField]);

    const blurActiveElement = () => { if (typeof document !== 'undefined') (document.activeElement as HTMLElement)?.blur(); };

    return (
        <>
            <Modal
                title={saveMode === 'rename' ? '重命名筛选' : '保存筛选'}
                open={saveModalOpen}
                onCancel={() => { blurActiveElement(); setSaveModalOpen(false); setSaveName(''); }}
                onOk={handleSaveFilters}
                okText={saveMode === 'rename' ? '保存名称' : '保存'}
                cancelText="取消"
                okButtonProps={{ disabled: !saveName.trim() }}
                focusTriggerAfterClose={false}
                afterOpenChange={saveModalProps.afterOpenChange}
            >
                <div ref={saveModalContainerRef}>
                    <Input ref={saveNameInputRef} placeholder="筛选名称" value={saveName} onChange={e => setSaveName(e.target.value)} />
                </div>
            </Modal>
            <Form form={form} layout="vertical" onValuesChange={handleFiltersChange}>
                <ProCard ghost>
                    <div style={{ position: 'sticky', top: 8, zIndex: 2, background: token.colorBgLayout, paddingBottom: 8 }}>
                        <ProCard>
                            <Row gutter={[12, 8]}>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="assigneeOrgId" label="组织">
                                        <Select allowClear showSearch placeholder="选择组织" optionFilterProp="label" options={organizations.map(o => ({ label: o.name, value: o.id }))} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="assigneeDeptId" label="部门">
                                        <Select allowClear showSearch placeholder={filters.assigneeOrgId ? '选择部门' : '先选组织'} optionFilterProp="label" disabled={!filters.assigneeOrgId || filters.orgSummary} options={departments.map(d => ({ label: d.name, value: d.id }))} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="assigneeId" label="负责人">
                                        <Select allowClear showSearch placeholder={filters.assigneeOrgId ? '选择负责人' : '先选组织'} optionFilterProp="label" disabled={!filters.assigneeOrgId || filters.orgSummary} options={users.map(u => ({ label: u.name, value: u.id }))} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="status" label="状态">
                                        <Select allowClear options={Object.entries(INTEL_TASK_STATUS_LABELS).map(([v, l]) => ({ label: l, value: v }))} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="type" label="任务类型">
                                        <Select allowClear options={Object.entries(INTEL_TASK_TYPE_LABELS).map(([v, l]) => ({ label: l, value: v }))} />
                                    </Form.Item>
                                </Col>
                                <Col xs={24} sm={12} md={8} lg={4}>
                                    <Form.Item name="priority" label="优先级">
                                        <Select allowClear options={Object.entries(INTEL_TASK_PRIORITY_LABELS).map(([v, l]) => ({ label: l, value: v }))} />
                                    </Form.Item>
                                </Col>
                            </Row>
                            <Divider style={{ margin: '8px 0' }} />
                            <Row align="middle" justify="space-between" gutter={[12, 8]}>
                                <Col flex="auto">
                                    <Space wrap size="small">
                                        <Button icon={<FilterOutlined />} onClick={openAdvancedDrawer}>高级筛选</Button>
                                        <Divider type="vertical" />
                                        <Text type="secondary">快速定位</Text>
                                        <Tooltip title="定位到今天并打开列表"><Button size="small" type={selectedDate?.isSame(dayjs(), 'day') ? 'primary' : 'default'} onClick={() => handleFocusDate(dayjs())}>今天</Button></Tooltip>
                                        <Tooltip title="定位到明天并打开列表"><Button size="small" type={selectedDate?.isSame(dayjs().add(1, 'day'), 'day') ? 'primary' : 'default'} onClick={() => handleFocusDate(dayjs().add(1, 'day'))}>明天</Button></Tooltip>
                                        <Tooltip title="切换到议程视图并聚焦本周"><Button size="small" onClick={handleFocusWeek}>本周</Button></Tooltip>
                                        <Divider type="vertical" />
                                        <Text type="secondary">快捷筛选</Text>
                                        <Button size="small" type={filters.status === IntelTaskStatus.OVERDUE ? 'primary' : 'default'} onClick={() => handleApplyPresetFilter('OVERDUE')}>逾期</Button>
                                        <Button size="small" type={filters.status === IntelTaskStatus.PENDING ? 'primary' : 'default'} onClick={() => handleApplyPresetFilter('PENDING')}>待办</Button>
                                        <Button size="small" type={filters.includePreview && !filters.status ? 'primary' : 'default'} onClick={() => handleApplyPresetFilter('PREVIEW')}>预览</Button>
                                        <Button size="small" type={filters.priority === IntelTaskPriority.URGENT ? 'primary' : 'default'} onClick={() => handleApplyPresetFilter('URGENT')}>紧急</Button>
                                    </Space>
                                </Col>
                                <Col>
                                    <Space size="small" wrap>
                                        {chips.length > 0 && <Text type="secondary">已筛选 {chips.length} 项</Text>}
                                        <Button size="small" onClick={handleClearAll} disabled={chips.length === 0}>清空</Button>
                                    </Space>
                                </Col>
                            </Row>
                            <Divider style={{ margin: '8px 0' }} />
                            <Space size="small" wrap>
                                <Text type="secondary">我的筛选</Text>
                                <Select size="small" placeholder="选择筛选" style={{ minWidth: 160 }} value={selectedSavedFilterId} onChange={handleApplySavedFilter} options={savedFilters.map(item => ({ label: item.name, value: item.id }))} allowClear onClear={() => handleApplySavedFilter(undefined)} />
                                {isFilterDirty && selectedSavedFilterId && <Tag color="orange">已修改</Tag>}
                                <Button size="small" icon={<SaveOutlined />} onClick={() => handleOpenSaveModal('create')}>保存为</Button>
                                <Button size="small" disabled={!selectedSavedFilterId || !isFilterDirty} onClick={handleOverwriteSavedFilter}>更新</Button>
                                <Button size="small" icon={<EditOutlined />} disabled={!selectedSavedFilterId} onClick={() => handleOpenSaveModal('rename')}>重命名</Button>
                                <Button size="small" danger icon={<DeleteOutlined />} disabled={!selectedSavedFilterId} onClick={handleDeleteSavedFilter}>删除</Button>
                            </Space>
                            {chips.length > 0 && (
                                <Space wrap size={[6, 6]} style={{ marginTop: 8 }}>
                                    {chips.map(chip => <Tag key={chip.key} closable onClose={e => { e.preventDefault(); chip.onClear(); }}>{chip.label}</Tag>)}
                                </Space>
                            )}
                        </ProCard>
                    </div>
                </ProCard>
            </Form>
        </>
    );
};
