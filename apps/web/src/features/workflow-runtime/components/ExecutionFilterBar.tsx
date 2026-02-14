import React, { useState } from 'react';
import {
    Button,
    Card,
    Checkbox,
    Col,
    Input,
    Row,
    Select,
    Space,
    Tabs,
    Tag,
    Typography,
} from 'antd';
import {
    CaretDownOutlined,
    CaretUpOutlined,
    FilterOutlined,
    SearchOutlined,
} from '@ant-design/icons';
import {
    WorkflowExecutionStatus,
    WorkflowFailureCategory,
    WorkflowRiskDegradeAction,
    WorkflowRiskLevel,
    WorkflowTriggerType,
} from '@packages/types';
import dayjs, { Dayjs } from 'dayjs';

const { Text } = Typography;

export interface ExecutionFilterProps {
    // Filters
    versionCodeInput: string;
    setVersionCodeInput: (val: string) => void;
    setVersionCode: (val?: string) => void;
    keywordInput: string;
    setKeywordInput: (val: string) => void;
    setKeyword: (val?: string) => void;
    selectedWorkflowDefinitionId?: string;
    setSelectedWorkflowDefinitionId: (val?: string) => void;
    selectedStatus?: WorkflowExecutionStatus;
    setSelectedStatus: (val?: WorkflowExecutionStatus) => void;
    selectedFailureCategory?: WorkflowFailureCategory;
    setSelectedFailureCategory: (val?: WorkflowFailureCategory) => void;
    failureCodeInput: string;
    setFailureCodeInput: (val: string) => void;
    setFailureCode: (val?: string) => void;
    selectedTriggerType?: WorkflowTriggerType;
    setSelectedTriggerType: (val?: WorkflowTriggerType) => void;
    selectedRiskLevel?: WorkflowRiskLevel;
    setSelectedRiskLevel: (val?: WorkflowRiskLevel) => void;
    selectedDegradeAction?: WorkflowRiskDegradeAction;
    setSelectedDegradeAction: (val?: WorkflowRiskDegradeAction) => void;
    selectedRiskGatePresence?: boolean;
    setSelectedRiskGatePresence: (val?: boolean) => void;
    selectedRiskSummaryPresence?: boolean;
    setSelectedRiskSummaryPresence: (val?: boolean) => void;
    startedAtRange: [Dayjs, Dayjs] | null;
    setStartedAtRange: (val: [Dayjs, Dayjs] | null) => void;
    onlySoftFailure: boolean;
    setOnlySoftFailure: (val: boolean) => void;
    onlyErrorRoute: boolean;
    setOnlyErrorRoute: (val: boolean) => void;
    onlyRiskBlocked: boolean;
    setOnlyRiskBlocked: (val: boolean) => void;
    riskProfileCodeInput: string;
    setRiskProfileCodeInput: (val: string) => void;
    setRiskProfileCode: (val?: string) => void;
    riskReasonKeywordInput: string;
    setRiskReasonKeywordInput: (val: string) => void;
    setRiskReasonKeyword: (val?: string) => void;

    // Options
    workflowDefinitionOptions: { label: string; value: string }[];
    executionStatusOptions: { label: string; value: WorkflowExecutionStatus }[];
    triggerTypeOptions: { label: string; value: WorkflowTriggerType }[];
    failureCategoryOptions: { label: string; value: WorkflowFailureCategory }[];
    riskLevelOptions: { label: string; value: WorkflowRiskLevel }[];
    degradeActionOptions: { label: string; value: WorkflowRiskDegradeAction }[];
    riskGatePresenceOptions: { label: string; value: boolean }[];
    riskSummaryPresenceOptions: { label: string; value: boolean }[];

    // Actions
    onReset: () => void;
    onPageReset: () => void; // Trigger page reset on filter change
}

export const ExecutionFilterBar: React.FC<ExecutionFilterProps> = (props) => {
    const [expandAdvanced, setExpandAdvanced] = useState(false);

    const handleTabChange = (key: string) => {
        props.onReset(); // Start fresh
        if (key === 'running') {
            props.setSelectedStatus('RUNNING');
        } else if (key === 'failed') {
            props.setSelectedStatus('FAILED');
        } else if (key === 'riskBlock') {
            props.setOnlyRiskBlocked(true);
        }
        props.onPageReset();
    };

    const activeTabKey = (() => {
        if (props.selectedStatus === 'RUNNING') return 'running';
        if (props.selectedStatus === 'FAILED') return 'failed';
        if (props.onlyRiskBlocked) return 'riskBlock';
        return 'all';
    })();

    const advancedFiltersActive =
        props.selectedFailureCategory ||
        props.failureCodeInput ||
        props.selectedRiskLevel ||
        props.selectedDegradeAction ||
        props.riskProfileCodeInput ||
        props.riskReasonKeywordInput ||
        props.selectedRiskGatePresence !== undefined ||
        props.selectedRiskSummaryPresence !== undefined ||
        props.onlySoftFailure ||
        props.onlyErrorRoute ||
        (props.onlyRiskBlocked && activeTabKey !== 'riskBlock');

    return (
        <Card bodyStyle={{ padding: '0 24px 16px 24px' }}>
            <Tabs
                activeKey={activeTabKey}
                onChange={handleTabChange}
                items={[
                    { label: '全部实例', key: 'all' },
                    { label: '运行中', key: 'running' },
                    { label: '失败/异常', key: 'failed' },
                    { label: '风控阻断', key: 'riskBlock' },
                ]}
                style={{ marginBottom: 16 }}
            />

            <Space direction="vertical" style={{ width: '100%' }} size={16}>
                {/* Primary Filters */}
                <Row gutter={[16, 16]}>
                    <Col md={8} lg={6} xl={5}>
                        <Input.Search
                            allowClear
                            placeholder="关键词（ID/名称/版本）"
                            value={props.keywordInput}
                            onChange={(e) => {
                                props.setKeywordInput(e.target.value);
                                if (!e.target.value.trim()) {
                                    props.setKeyword(undefined);
                                    props.onPageReset();
                                }
                            }}
                            onSearch={(val) => {
                                props.setKeyword(val.trim() || undefined);
                                props.onPageReset();
                            }}
                        />
                    </Col>
                    <Col md={6} lg={5} xl={4}>
                        <Select
                            allowClear
                            style={{ width: '100%' }}
                            placeholder="所属流程"
                            options={props.workflowDefinitionOptions}
                            value={props.selectedWorkflowDefinitionId}
                            onChange={(val) => {
                                props.setSelectedWorkflowDefinitionId(val);
                                props.onPageReset();
                            }}
                            showSearch
                            filterOption={(input, option) =>
                                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
                            }
                        />
                    </Col>
                    <Col md={6} lg={5} xl={4}>
                        <Select
                            allowClear
                            style={{ width: '100%' }}
                            placeholder="触发类型"
                            options={props.triggerTypeOptions}
                            value={props.selectedTriggerType}
                            onChange={(val) => {
                                props.setSelectedTriggerType(val);
                                props.onPageReset();
                            }}
                        />
                    </Col>
                    <Col md={4} >
                        <Button
                            type={advancedFiltersActive ? 'primary' : 'default'}
                            ghost={Boolean(advancedFiltersActive)}
                            icon={expandAdvanced ? <CaretUpOutlined /> : <CaretDownOutlined />}
                            onClick={() => setExpandAdvanced(!expandAdvanced)}
                        >
                            高级筛选 {advancedFiltersActive && <Tag color="blue" style={{ marginLeft: 8 }}>Active</Tag>}
                        </Button>
                        <Button type="link" onClick={props.onReset} style={{ marginLeft: 8 }}>重置</Button>
                    </Col>
                </Row>

                {/* Advanced Filters */}
                {expandAdvanced && (
                    <div style={{ background: '#fafafa', padding: 16, borderRadius: 8 }}>
                        <Row gutter={[16, 16]}>
                            <Col span={24}>
                                <Text strong>风控筛选</Text>
                            </Col>
                            <Col span={4}>
                                <Select
                                    allowClear
                                    style={{ width: '100%' }}
                                    placeholder="风险等级"
                                    options={props.riskLevelOptions}
                                    value={props.selectedRiskLevel}
                                    onChange={(val) => { props.setSelectedRiskLevel(val); props.onPageReset(); }}
                                />
                            </Col>
                            <Col span={4}>
                                <Select
                                    allowClear
                                    style={{ width: '100%' }}
                                    placeholder="降级动作"
                                    options={props.degradeActionOptions}
                                    value={props.selectedDegradeAction}
                                    onChange={(val) => { props.setSelectedDegradeAction(val); props.onPageReset(); }}
                                />
                            </Col>
                            <Col span={4}>
                                <Input
                                    allowClear
                                    placeholder="风控模板编码"
                                    value={props.riskProfileCodeInput}
                                    onChange={(e) => {
                                        props.setRiskProfileCodeInput(e.target.value);
                                        if (!e.target.value.trim()) { props.setRiskProfileCode(undefined); props.onPageReset(); }
                                    }}
                                    onPressEnter={() => { props.setRiskProfileCode(props.riskProfileCodeInput.trim() || undefined); props.onPageReset(); }}
                                />
                            </Col>
                            <Col span={4}>
                                <Input
                                    allowClear
                                    placeholder="阻断原因关键词"
                                    value={props.riskReasonKeywordInput}
                                    onChange={(e) => {
                                        props.setRiskReasonKeywordInput(e.target.value);
                                        if (!e.target.value.trim()) { props.setRiskReasonKeyword(undefined); props.onPageReset(); }
                                    }}
                                    onPressEnter={() => { props.setRiskReasonKeyword(props.riskReasonKeywordInput.trim() || undefined); props.onPageReset(); }}
                                />
                            </Col>

                            <Col span={24} style={{ marginTop: 8 }}>
                                <Text strong>状态筛选</Text>
                            </Col>
                            <Col span={4}>
                                <Select
                                    allowClear
                                    style={{ width: '100%' }}
                                    placeholder="执行状态" // Redundant with tabs but useful for specific combos
                                    options={props.executionStatusOptions}
                                    value={props.selectedStatus}
                                    onChange={(val) => { props.setSelectedStatus(val); props.onPageReset(); }}
                                />
                            </Col>
                            <Col span={4}>
                                <Select
                                    allowClear
                                    style={{ width: '100%' }}
                                    placeholder="失败分类"
                                    options={props.failureCategoryOptions}
                                    value={props.selectedFailureCategory}
                                    onChange={(val) => { props.setSelectedFailureCategory(val); props.onPageReset(); }}
                                />
                            </Col>
                            <Col span={4}>
                                <Input
                                    allowClear
                                    placeholder="失败代码"
                                    value={props.failureCodeInput}
                                    onChange={(e) => {
                                        props.setFailureCodeInput(e.target.value);
                                        if (!e.target.value.trim()) { props.setFailureCode(undefined); props.onPageReset(); }
                                    }}
                                    onPressEnter={() => { props.setFailureCode(props.failureCodeInput.trim() || undefined); props.onPageReset(); }}
                                />
                            </Col>

                            <Col span={24} style={{ marginTop: 8 }}>
                                <Space size={16}>
                                    <Checkbox checked={props.onlySoftFailure} onChange={(e) => { props.setOnlySoftFailure(e.target.checked); props.onPageReset(); }}>仅软失败</Checkbox>
                                    <Checkbox checked={props.onlyErrorRoute} onChange={(e) => { props.setOnlyErrorRoute(e.target.checked); props.onPageReset(); }}>仅错误分支</Checkbox>
                                    <Checkbox checked={props.onlyRiskBlocked} onChange={(e) => { props.setOnlyRiskBlocked(e.target.checked); props.onPageReset(); }}>仅风控阻断</Checkbox>
                                </Space>
                            </Col>
                        </Row>
                    </div>
                )}
            </Space>
        </Card>
    );
};
