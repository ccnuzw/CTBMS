import React, { useState } from 'react';
import { Button, Modal, Typography, Table, Tag, Divider, Alert, Space, Descriptions, Collapse } from 'antd';
import { QuestionCircleOutlined, CheckCircleOutlined, ClockCircleOutlined, TeamOutlined, SettingOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

/**
 * 任务模板配置帮助说明组件
 * 提供任务模板各配置项的详细说明
 */
export const TemplateConfigHelp: React.FC = () => {
    const [open, setOpen] = useState(false);

    return (
        <>
            <Button
                type="text"
                icon={<QuestionCircleOutlined />}
                onClick={() => setOpen(true)}
            >
                配置说明
            </Button>

            <Modal
                title="任务模板配置说明"
                open={open}
                onCancel={() => setOpen(false)}
                footer={<Button onClick={() => setOpen(false)}>关闭</Button>}
                width={960}
                styles={{ body: { maxHeight: '75vh', overflowY: 'auto' } }}
            >
                <Typography>
                    {/* 概述 */}
                    <Alert
                        type="info"
                        showIcon
                        message="模板说明"
                        description="任务模板定义了任务的基本属性和分发规则。模板可以按周期自动生成任务，也可以手动触发分发。每个模板可以配置多条分发规则，实现精细化的任务分配。"
                        style={{ marginBottom: 24 }}
                    />

                    <Collapse
                        defaultActiveKey={['basic', 'cycle', 'assign']}
                        items={[
                            {
                                key: 'basic',
                                label: (
                                    <Space>
                                        <CheckCircleOutlined style={{ color: '#1890ff' }} />
                                        <Text strong>基础信息</Text>
                                        <Tag color="blue">必填</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'name',
                                                    field: '模板名称',
                                                    required: '是',
                                                    desc: '模板的唯一标识名称，建议包含任务类型和目标范围',
                                                    example: '每日港口采集任务、周度区域价格调研',
                                                },
                                                {
                                                    key: 'description',
                                                    field: '任务描述',
                                                    required: '否',
                                                    desc: '任务的详细说明和要求，会显示在任务卡片中',
                                                    example: '请于每日17:00前完成当日港口价格采集',
                                                },
                                                {
                                                    key: 'taskType',
                                                    field: '任务类型',
                                                    required: '是',
                                                    desc: '决定任务的性质和后续处理流程',
                                                    example: '采集任务、报告任务、核实任务',
                                                },
                                                {
                                                    key: 'priority',
                                                    field: '优先级',
                                                    required: '否',
                                                    desc: '任务的紧急程度，影响任务列表排序',
                                                    example: '低、中、高、紧急',
                                                },
                                            ]}
                                            columns={[
                                                { title: '字段', dataIndex: 'field', width: 100 },
                                                { title: '必填', dataIndex: 'required', width: 50, render: (v) => v === '是' ? <Tag color="red">是</Tag> : <Tag>否</Tag> },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '示例', dataIndex: 'example', width: 200 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>任务类型详解</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'COLLECTION',
                                                    type: '采集任务',
                                                    desc: '用于价格数据采集，必须绑定采集点',
                                                    flow: '填报 → 提交 → 审核 → 完成',
                                                    bind: '必须绑定采集点',
                                                    special: '可继承采集点频率设置',
                                                },
                                                {
                                                    key: 'REPORT',
                                                    type: '报告任务',
                                                    desc: '用于调研报告提交，不绑定采集点',
                                                    flow: '填报 → 提交 → 审核 → 完成',
                                                    bind: '不绑定采集点',
                                                    special: '可附件上传',
                                                },
                                                {
                                                    key: 'VERIFICATION',
                                                    type: '核实任务',
                                                    desc: '用于数据核实确认，不绑定采集点',
                                                    flow: '核实 → 确认 → 完成',
                                                    bind: '不绑定采集点',
                                                    special: '用于异常数据复核',
                                                },
                                            ]}
                                            columns={[
                                                { title: '类型', dataIndex: 'type', width: 100, render: (v, r) => <Tag color="blue">{v}</Tag> },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '处理流程', dataIndex: 'flow', width: 180 },
                                                { title: '绑定要求', dataIndex: 'bind', width: 120 },
                                                { title: '特殊说明', dataIndex: 'special', width: 140 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>优先级说明</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                { key: 'LOW', level: '低', color: 'default', desc: '常规任务，无特殊时效要求', scenario: '定期统计、周报填写' },
                                                { key: 'MEDIUM', level: '中', color: 'blue', desc: '一般优先级，正常处理顺序', scenario: '日常采集、例行报告' },
                                                { key: 'HIGH', level: '高', color: 'orange', desc: '较高优先级，应优先处理', scenario: '重要客户数据、紧急调研' },
                                                { key: 'URGENT', level: '紧急', color: 'red', desc: '最高优先级，需立即处理', scenario: '突发事件、领导交办' },
                                            ]}
                                            columns={[
                                                { title: '级别', dataIndex: 'level', width: 60, render: (v, r) => <Tag color={r.color}>{v}</Tag> },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '适用场景', dataIndex: 'scenario' },
                                            ]}
                                        />
                                    </>
                                ),
                            },
                            {
                                key: 'cycle',
                                label: (
                                    <Space>
                                        <ClockCircleOutlined style={{ color: '#52c41a' }} />
                                        <Text strong>周期配置</Text>
                                        <Tag color="green">调度</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            type="info"
                                            showIcon
                                            message="周期配置决定任务的自动生成时间"
                                            style={{ marginBottom: 16 }}
                                        />

                                        <Divider orientation="left" plain>频率来源（仅采集任务）</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'POINT_DEFAULT',
                                                    mode: '继承采集点频率',
                                                    desc: '任务的生成频率由采集点自身配置决定',
                                                    scenario: '不同采集点有不同采集频率（如港口每日、区域每周）',
                                                    advantage: '灵活性高，适合异构采集点',
                                                },
                                                {
                                                    key: 'TEMPLATE_OVERRIDE',
                                                    mode: '模板覆盖频率',
                                                    desc: '使用模板设置的周期，忽略采集点配置',
                                                    scenario: '所有采集点使用统一频率',
                                                    advantage: '管理简单，便于统一调度',
                                                },
                                            ]}
                                            columns={[
                                                { title: '模式', dataIndex: 'mode', width: 130, render: (v) => <Tag color="cyan">{v}</Tag> },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '适用场景', dataIndex: 'scenario' },
                                                { title: '优势', dataIndex: 'advantage', width: 160 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>执行周期</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'DAILY',
                                                    type: '每日',
                                                    desc: '每天在指定时间生成任务',
                                                    config: '下发时间、截止时间',
                                                    example: '每天 09:00 下发，17:00 截止',
                                                },
                                                {
                                                    key: 'WEEKLY',
                                                    type: '每周',
                                                    desc: '每周指定日期生成任务',
                                                    config: '分发日（周几）、截止日（周几）、下发/截止时间',
                                                    example: '每周一 09:00 下发，周五 17:00 截止',
                                                },
                                                {
                                                    key: 'MONTHLY',
                                                    type: '每月',
                                                    desc: '每月指定日期生成任务',
                                                    config: '分发日（几号）、截止日（几号）、下发/截止时间',
                                                    example: '每月1日 09:00 下发，5日 17:00 截止',
                                                },
                                                {
                                                    key: 'ONE_TIME',
                                                    type: '一次性',
                                                    desc: '仅执行一次，不循环',
                                                    config: '下发时间、截止时间',
                                                    example: '指定日期一次性下发',
                                                },
                                            ]}
                                            columns={[
                                                { title: '周期', dataIndex: 'type', width: 70, render: (v) => <Tag color="geekblue">{v}</Tag> },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '需配置项', dataIndex: 'config' },
                                                { title: '示例', dataIndex: 'example', width: 200 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>时间配置说明</Divider>
                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="下发时间">
                                                <Space direction="vertical">
                                                    <Text>任务自动生成并分发给执行人的时间点</Text>
                                                    <Text type="secondary">格式：HH:mm（如 09:00 表示上午9点）</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="截止时间">
                                                <Space direction="vertical">
                                                    <Text>任务需要完成的最终时限</Text>
                                                    <Text type="secondary">超过截止时间未完成的任务将标记为逾期</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="完成时限（小时）">
                                                <Space direction="vertical">
                                                    <Text>任务分发后多少小时内需完成（截止时间 = 下发时间 + 完成时限）</Text>
                                                    <Text type="secondary">例如：设为8小时，09:00下发的任务 17:00截止</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="分发日/截止日（周）">
                                                <Space direction="vertical">
                                                    <Text>每周任务的触发和截止是周几</Text>
                                                    <Text type="secondary">1=周一, 2=周二, ... 7=周日</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="分发日/截止日（月）">
                                                <Space direction="vertical">
                                                    <Text>每月任务的触发和截止是几号</Text>
                                                    <Text type="secondary">1-31 表示具体日期，0 表示月末（自动适配不同月份天数）</Text>
                                                </Space>
                                            </Descriptions.Item>
                                        </Descriptions>
                                    </>
                                ),
                            },
                            {
                                key: 'assign',
                                label: (
                                    <Space>
                                        <TeamOutlined style={{ color: '#fa8c16' }} />
                                        <Text strong>分配范围</Text>
                                        <Tag color="orange">核心</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            type="warning"
                                            showIcon
                                            message="分配范围决定任务发给谁"
                                            description="采集任务必须选择「按采集点负责人」模式，其他类型任务可自由选择"
                                            style={{ marginBottom: 16 }}
                                        />

                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'BY_COLLECTION_POINT',
                                                    mode: '按采集点负责人',
                                                    desc: '根据采集点类型或指定采集点，分配给对应负责人',
                                                    subConfig: '采集点类型（多选）或 具体采集点（多选）',
                                                    scenario: '采集任务必选',
                                                    result: '每个采集点的负责人各生成一个任务，任务绑定采集点',
                                                },
                                                {
                                                    key: 'MANUAL',
                                                    mode: '手动指定',
                                                    desc: '手动选择具体人员列表',
                                                    subConfig: '人员选择器（支持按组织/部门筛选）',
                                                    scenario: '临时任务、特定人员任务',
                                                    result: '每个选中的人员各生成一个任务',
                                                },
                                                {
                                                    key: 'BY_DEPARTMENT',
                                                    mode: '按部门',
                                                    desc: '分配给指定部门的所有成员',
                                                    subConfig: '部门选择器（支持多选）',
                                                    scenario: '部门级任务分发',
                                                    result: '部门内所有成员各生成一个任务',
                                                },
                                                {
                                                    key: 'BY_ORGANIZATION',
                                                    mode: '按组织',
                                                    desc: '分配给指定组织的所有成员',
                                                    subConfig: '组织选择器（支持多选）',
                                                    scenario: '组织级任务分发',
                                                    result: '组织内所有成员各生成一个任务',
                                                },
                                            ]}
                                            columns={[
                                                { title: '模式', dataIndex: 'mode', width: 120, render: (v) => <Tag color="orange">{v}</Tag> },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '子配置项', dataIndex: 'subConfig', width: 180 },
                                                { title: '生成结果', dataIndex: 'result', width: 200 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>采集点范围选择（按采集点负责人模式）</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'TYPE',
                                                    scope: '按类型',
                                                    desc: '选择采集点类型，自动包含该类型下所有采集点',
                                                    advantage: '新增采集点自动纳入',
                                                    disadvantage: '无法精确控制具体采集点',
                                                },
                                                {
                                                    key: 'POINTS',
                                                    scope: '按采集点',
                                                    desc: '精确选择具体的采集点列表',
                                                    advantage: '精确控制分发范围',
                                                    disadvantage: '新增采集点需手动添加',
                                                },
                                            ]}
                                            columns={[
                                                { title: '范围', dataIndex: 'scope', width: 80, render: (v) => <Tag>{v}</Tag> },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '优势', dataIndex: 'advantage', width: 150 },
                                                { title: '劣势', dataIndex: 'disadvantage', width: 150 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>采集点类型说明</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                { key: 'PORT', type: '港口', icon: '🚢', desc: '港口价格采集点，如深圳港、广州港' },
                                                { key: 'ENTERPRISE', type: '企业', icon: '🏭', desc: '企业价格采集点，如生产商、贸易商' },
                                                { key: 'WAREHOUSE', type: '仓库', icon: '📦', desc: '仓库库存采集点' },
                                                { key: 'MARKET', type: '市场', icon: '🏪', desc: '批发市场价格采集点' },
                                                { key: 'REGION', type: '区域', icon: '📍', desc: '区域综合价格采集点' },
                                            ]}
                                            columns={[
                                                { title: '图标', dataIndex: 'icon', width: 50 },
                                                { title: '类型', dataIndex: 'type', width: 60 },
                                                { title: '说明', dataIndex: 'desc' },
                                            ]}
                                        />
                                    </>
                                ),
                            },
                            {
                                key: 'advanced',
                                label: (
                                    <Space>
                                        <SettingOutlined style={{ color: '#722ed1' }} />
                                        <Text strong>高级配置</Text>
                                        <Tag color="purple">可选</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'activeFrom',
                                                    field: '生效时间',
                                                    desc: '模板开始自动生成任务的时间',
                                                    default: '立即生效',
                                                    scenario: '延迟启用、预设模板',
                                                },
                                                {
                                                    key: 'activeUntil',
                                                    field: '失效时间',
                                                    desc: '模板停止自动生成任务的时间',
                                                    default: '永不失效',
                                                    scenario: '临时任务、阶段性任务',
                                                },
                                                {
                                                    key: 'maxBackfillPeriods',
                                                    field: '允许补发周期数',
                                                    desc: '系统故障恢复后，允许补发的历史周期数量',
                                                    default: '0（不补发）',
                                                    scenario: '重要任务需要历史补发',
                                                },
                                                {
                                                    key: 'allowLate',
                                                    field: '允许延期',
                                                    desc: '是否允许在截止时间后继续提交',
                                                    default: '不允许',
                                                    scenario: '特殊情况需要延期提交',
                                                },
                                            ]}
                                            columns={[
                                                { title: '字段', dataIndex: 'field', width: 120 },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '默认值', dataIndex: 'default', width: 100 },
                                                { title: '适用场景', dataIndex: 'scenario', width: 160 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>高级配置说明</Divider>
                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="生效/失效时间">
                                                <Space direction="vertical">
                                                    <Text>控制模板的有效期范围</Text>
                                                    <Text type="secondary">• 在生效时间之前，模板不会自动生成任务</Text>
                                                    <Text type="secondary">• 在失效时间之后，模板不会再生成新任务</Text>
                                                    <Text type="secondary">• 手动分发不受此限制</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="允许补发周期数">
                                                <Space direction="vertical">
                                                    <Text>当系统故障或维护后恢复，可以自动补发错过的任务</Text>
                                                    <Text type="secondary">• 设为0表示不补发历史任务</Text>
                                                    <Text type="secondary">• 设为3表示最多补发最近3个周期的任务</Text>
                                                    <Text type="warning">⚠️ 补发可能导致大量任务突然生成，请谨慎设置</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="允许延期">
                                                <Space direction="vertical">
                                                    <Text>控制任务是否可以在截止后继续提交</Text>
                                                    <Text type="secondary">• 开启后，逾期的任务仍可提交，会标记为"延期完成"</Text>
                                                    <Text type="secondary">• 关闭后，超时任务直接标记为"逾期未完成"</Text>
                                                </Space>
                                            </Descriptions.Item>
                                        </Descriptions>
                                    </>
                                ),
                            },
                            {
                                key: 'rule',
                                label: (
                                    <Space>
                                        <SettingOutlined style={{ color: '#eb2f96' }} />
                                        <Text strong>分发规则（高级）</Text>
                                        <Tag color="magenta">精细控制</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            type="info"
                                            showIcon
                                            message="分发规则用于实现更精细的任务分配控制"
                                            description="每个模板可以配置多条规则，规则之间相互独立执行。规则可以覆盖模板的周期和分配设置。"
                                            style={{ marginBottom: 16 }}
                                        />

                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="规则与模板的关系">
                                                <Space direction="vertical">
                                                    <Text>模板定义任务的<Text strong>基本属性</Text>（名称、类型、优先级等）</Text>
                                                    <Text>规则定义<Text strong>分发细节</Text>（谁来做、什么时候做、完成策略等）</Text>
                                                    <Text type="secondary">一个模板可以有多条规则，每条规则独立触发任务生成</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="规则配置入口">
                                                <Text>模板列表 → 操作栏「规则」按钮 → 规则管理抽屉</Text>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="规则配置项">
                                                <Space direction="vertical">
                                                    <Text>• <Text strong>范围</Text>：采集点/人员/部门/组织/角色/复合条件</Text>
                                                    <Text>• <Text strong>频率</Text>：每日/每周/每月/一次性</Text>
                                                    <Text>• <Text strong>分配策略</Text>：采集点负责人/轮值/负载均衡/人员池</Text>
                                                    <Text>• <Text strong>完成策略</Text>：每人/任一人/达标数/全员</Text>
                                                    <Text>• <Text strong>任务组</Text>：是否将同批次任务归组</Text>
                                                </Space>
                                            </Descriptions.Item>
                                        </Descriptions>
                                    </>
                                ),
                            },
                        ]}
                    />

                    <Divider />

                    {/* 常见问题 */}
                    <Title level={4}>❓ 常见问题</Title>
                    <Descriptions bordered size="small" column={1}>
                        <Descriptions.Item label="Q: 采集任务和报告任务有什么区别？">
                            采集任务必须绑定采集点，用于结构化价格数据采集；报告任务不绑定采集点，用于自由格式的调研报告。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 如何让不同采集点使用不同的采集频率？">
                            将频率来源设为「继承采集点频率」，然后在各采集点的配置中设置各自的频率。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 模板和规则有什么区别？">
                            模板定义任务的"是什么"（名称、类型、优先级），规则定义"怎么分发"（给谁、什么时候、完成策略）。一个模板可以有多条规则。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 新增的采集点会自动纳入任务分发吗？">
                            如果使用「按类型」选择采集点范围，新增采集点会自动纳入；如果使用「按采集点」精确选择，需要手动添加。
                        </Descriptions.Item>
                    </Descriptions>

                    <Divider />

                    {/* 推荐配置 */}
                    <Title level={4}>💡 推荐配置方案</Title>
                    <Table
                        size="small"
                        pagination={false}
                        bordered
                        dataSource={[
                            {
                                scenario: '每日港口采集',
                                type: '采集任务',
                                cycle: '每日 / 继承采集点',
                                assign: '按采集点负责人 + 按类型(港口)',
                                time: '09:00下发, 17:00截止',
                            },
                            {
                                scenario: '每周区域调研',
                                type: '采集任务',
                                cycle: '每周 / 模板覆盖',
                                assign: '按采集点负责人 + 按类型(区域)',
                                time: '周一09:00下发, 周五17:00截止',
                            },
                            {
                                scenario: '月度市场报告',
                                type: '报告任务',
                                cycle: '每月',
                                assign: '按部门',
                                time: '每月1日下发, 5日截止',
                            },
                            {
                                scenario: '临时数据核实',
                                type: '核实任务',
                                cycle: '一次性',
                                assign: '手动指定',
                                time: '立即下发, 24小时内截止',
                            },
                        ]}
                        columns={[
                            { title: '场景', dataIndex: 'scenario', width: 120 },
                            { title: '任务类型', dataIndex: 'type', width: 80 },
                            { title: '周期配置', dataIndex: 'cycle' },
                            { title: '分配范围', dataIndex: 'assign' },
                            { title: '时间设置', dataIndex: 'time', width: 180 },
                        ]}
                    />
                </Typography>
            </Modal>
        </>
    );
};
