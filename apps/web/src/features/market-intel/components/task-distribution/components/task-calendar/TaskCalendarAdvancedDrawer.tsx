import React from 'react';
import { Drawer, Space, Typography, Form, Switch, Divider, Button } from 'antd';
import { useTaskCalendarViewModel } from './useTaskCalendarViewModel';

const { Text } = Typography;

interface Props {
    viewModel: ReturnType<typeof useTaskCalendarViewModel>;
}

export const TaskCalendarAdvancedDrawer: React.FC<Props> = ({ viewModel }) => {
    const {
        state: { advancedOpen, filters },
        refs: { form, advancedDrawerContainerRef, advancedDrawerFocusRef, advancedDrawerProps },
        actions: { closeAdvancedDrawer, handleApplyPresetFilter }
    } = viewModel;

    return (
        <Drawer
            title="高级筛选"
            placement="left"
            width={360}
            open={advancedOpen}
            onClose={closeAdvancedDrawer}
            afterOpenChange={advancedDrawerProps.afterOpenChange}
        >
            <div ref={advancedDrawerContainerRef}>
                <Form form={form} layout="vertical">
                    <Space direction="vertical" size="middle" style={{ width: '100%' }}>
                        <Text strong>视图与汇总</Text>
                        <Form.Item name="orgSummary" label="组织汇总" valuePropName="checked">
                            <Switch ref={advancedDrawerFocusRef as any} />
                        </Form.Item>
                        <Form.Item
                            name="includePreview"
                            label="包含预览任务"
                            valuePropName="checked"
                            tooltip={filters.status ? '已选择状态时不可包含预览任务' : ''}
                        >
                            <Switch disabled={!!filters.status} />
                        </Form.Item>

                        <Divider style={{ margin: '4px 0' }} />
                        <Text strong>快捷筛选</Text>
                        <Space wrap>
                            <Button onClick={() => handleApplyPresetFilter('OVERDUE')}>仅看逾期</Button>
                            <Button onClick={() => handleApplyPresetFilter('PENDING')}>仅看待办</Button>
                            <Button onClick={() => handleApplyPresetFilter('PREVIEW')}>仅看预览</Button>
                            <Button onClick={() => handleApplyPresetFilter('URGENT')}>仅看紧急</Button>
                        </Space>
                        <Text type="secondary">
                            高级筛选会与主筛选条叠加生效，组织汇总开启时将清空部门与负责人。
                        </Text>
                    </Space>
                </Form>
            </div>
        </Drawer>
    );
};
