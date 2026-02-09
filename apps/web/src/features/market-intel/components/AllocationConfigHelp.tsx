import React, { useState } from 'react';
import { Button, Modal, Typography, Table, Tag, Divider, Alert, Space, Descriptions, Collapse, theme } from 'antd';
import {
    QuestionCircleOutlined,
    UserOutlined,
    EnvironmentOutlined,
    SwapOutlined,
    CheckSquareOutlined,
    TeamOutlined,
    SearchOutlined,
    BulbOutlined,
    SettingOutlined,
    InfoCircleOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

/**
 * 人员分配配置详细帮助说明组件
 * 提供人员分配各功能的超详细说明
 */
export const AllocationConfigHelp: React.FC = () => {
    const [open, setOpen] = useState(false);
    const { token } = theme.useToken();

    return (
        <>
            <Tag
                icon={<InfoCircleOutlined />}
                style={{ cursor: 'pointer', margin: 0 }}
                onClick={() => setOpen(true)}
            >
                配置说明
            </Tag>

            <Modal
                title="人员分配完整说明"
                open={open}
                onCancel={() => setOpen(false)}
                footer={<Button type="primary" onClick={() => setOpen(false)}>我知道了</Button>}
                width={1000}
                styles={{ body: { maxHeight: '80vh', overflowY: 'auto' } }}
            >
                <Typography>
                    {/* 概述 */}
                    <Alert
                        type="info"
                        showIcon
                        message="人员分配核心概念"
                        description="人员分配用于建立「采集点」与「负责人」之间的关联关系。分配后，当任务模板选择「按采集点负责人」分配时，系统会自动将任务分发给对应的负责人。分配是任务分发的基础。"
                        style={{ marginBottom: 24 }}
                    />

                    <Collapse
                        defaultActiveKey={['mode', 'byUser', 'byPoint']}
                        items={[
                            {
                                key: 'mode',
                                label: (
                                    <Space>
                                        <SwapOutlined style={{ color: '#1890ff' }} />
                                        <Text strong>两种分配模式</Text>
                                        <Tag color="blue">核心</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            type="info"
                                            showIcon
                                            message="选择合适的模式可以大幅提升分配效率"
                                            style={{ marginBottom: 16 }}
                                        />

                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'BY_USER',
                                                    mode: '按员工分配',
                                                    icon: '👤',
                                                    core: '以"人"为核心',
                                                    desc: '选中某个员工，为其分配管辖的采集点',
                                                    scenario: '新员工入职、调整某人职责范围、查看某人负责内容',
                                                    advantage: '清晰看到某人负责了哪些点',
                                                },
                                                {
                                                    key: 'POINT_COVERAGE',
                                                    mode: '按采集点分配',
                                                    icon: '📍',
                                                    core: '以"点"为核心',
                                                    desc: '聚焦采集点，为其指定负责人',
                                                    scenario: '排查未分配点、区域性调整、批量分配',
                                                    advantage: '快速补齐遗漏的采集点',
                                                },
                                            ]}
                                            columns={[
                                                { title: '模式', dataIndex: 'mode', width: 120, render: (v, r) => <Space><span>{r.icon}</span><Text strong>{v}</Text></Space> },
                                                { title: '核心视角', dataIndex: 'core', width: 100 },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '适用场景', dataIndex: 'scenario' },
                                                { title: '优势', dataIndex: 'advantage', width: 160 },
                                            ]}
                                        />
                                    </>
                                ),
                            },
                            {
                                key: 'byUser',
                                label: (
                                    <Space>
                                        <UserOutlined style={{ color: '#52c41a' }} />
                                        <Text strong>按员工分配 - 详细指南</Text>
                                        <Tag color="green">推荐</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Title level={5}>界面布局</Title>
                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="左侧：负责人列表">
                                                <Space direction="vertical">
                                                    <Text>显示符合筛选条件的用户列表</Text>
                                                    <Text type="secondary">• 每个用户显示姓名、所属组织/部门</Text>
                                                    <Text type="secondary">• 显示「N 点」标签表示已分配采集点数量</Text>
                                                    <Text type="secondary">• Badge 数字表示待办任务数量</Text>
                                                    <Text type="secondary">• 支持按姓名/负载/待办排序</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="右侧：采集点卡片">
                                                <Space direction="vertical">
                                                    <Text>以卡片形式展示采集点，直观显示分配状态</Text>
                                                    <Text type="secondary">• 绿色边框/背景 = 已分配给当前选中用户</Text>
                                                    <Text type="secondary">• 黄色「未分配」标签 = 该点尚无负责人</Text>
                                                    <Text type="secondary">• 点击卡片上的复选框可快速分配/取消</Text>
                                                </Space>
                                            </Descriptions.Item>
                                        </Descriptions>

                                        <Divider orientation="left" plain>操作流程</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                { step: '1', action: '定位员工', desc: '在左侧使用组织树或搜索框找到目标员工', tip: '可按姓名模糊搜索' },
                                                { step: '2', action: '选中员工', desc: '点击员工卡片，右侧将刷新显示相关采集点', tip: '蓝色边框表示当前选中' },
                                                { step: '3', action: '查看现状', desc: '绿色背景的卡片表示该员工已负责的采集点', tip: '可切换「我负责」筛选' },
                                                { step: '4', action: '新增分配', desc: '找到未分配的采集点，勾选「分配」复选框', tip: '会弹出品种选择（如有）' },
                                                { step: '5', action: '取消分配', desc: '找到已分配的采集点，取消勾选「已分配」', tip: '需确认后生效' },
                                            ]}
                                            columns={[
                                                { title: '步骤', dataIndex: 'step', width: 50 },
                                                { title: '操作', dataIndex: 'action', width: 80 },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '提示', dataIndex: 'tip', width: 160 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>批量分配功能</Divider>
                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="开启批量模式">
                                                点击工具栏的「批量选择」按钮开启多选模式
                                            </Descriptions.Item>
                                            <Descriptions.Item label="选择采集点">
                                                <Space direction="vertical">
                                                    <Text>在批量模式下，点击卡片即可选中/取消选中</Text>
                                                    <Text type="secondary">• 「全选当前」：选中当前筛选条件下所有可分配的采集点</Text>
                                                    <Text type="secondary">• 「清空选择」：取消所有已选中的采集点</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="确认分配">
                                                选择完成后点击「批量分配」按钮，系统会将选中的采集点全部分配给当前用户
                                            </Descriptions.Item>
                                        </Descriptions>

                                        <Divider orientation="left" plain>筛选功能</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                { filter: '组织/部门', location: '顶部筛选栏', desc: '筛选属于特定组织或部门的用户', example: '选择「华北大区」' },
                                                { filter: '人员搜索', location: '顶部筛选栏', desc: '按姓名模糊搜索用户', example: '输入「张」搜索姓张的同事' },
                                                { filter: '采集点类型', location: '顶部筛选栏', desc: '筛选特定类型的采集点', example: '只看「港口」类型' },
                                                { filter: '采集点搜索', location: '顶部筛选栏', desc: '按名称搜索采集点', example: '输入「锦州」' },
                                                { filter: '分配状态', location: '采集点列表上方', desc: '筛选全部/未分配/已分配/我负责', example: '切换「未分配」查看遗漏' },
                                                { filter: '用户排序', location: '左侧列表标题', desc: '按姓名/负载/待办排序用户', example: '按负载排序查看工作量分布' },
                                            ]}
                                            columns={[
                                                { title: '筛选项', dataIndex: 'filter', width: 100 },
                                                { title: '位置', dataIndex: 'location', width: 120 },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '示例', dataIndex: 'example', width: 160 },
                                            ]}
                                        />
                                    </>
                                ),
                            },
                            {
                                key: 'byPoint',
                                label: (
                                    <Space>
                                        <EnvironmentOutlined style={{ color: '#fa541c' }} />
                                        <Text strong>按采集点分配 - 详细指南</Text>
                                        <Tag color="volcano">补漏</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            type="info"
                                            showIcon
                                            message="适用于排查未分配采集点并批量指派负责人"
                                            style={{ marginBottom: 16 }}
                                        />

                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="使用场景">
                                                <Space direction="vertical">
                                                    <Text>• 定期检查是否有采集点遗漏分配</Text>
                                                    <Text>• 批量处理新增的采集点</Text>
                                                    <Text>• 区域或类型范围内的统一调整</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="默认筛选">
                                                进入此模式时，默认只显示「未分配」状态的采集点，便于快速补齐
                                            </Descriptions.Item>
                                        </Descriptions>

                                        <Divider orientation="left" plain>操作流程</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                { step: '1', action: '筛选范围', desc: '使用顶部筛选栏缩小采集点范围', tip: '如选择「港口」类型' },
                                                { step: '2', action: '选择采集点', desc: '勾选一个或多个需要分配的采集点', tip: '支持全选' },
                                                { step: '3', action: '点击分配', desc: '点击「分配」或「变更负责人」按钮', tip: '弹出人员选择框' },
                                                { step: '4', action: '选择负责人', desc: '在弹窗中搜索并选择目标负责人', tip: '支持按组织筛选' },
                                                { step: '5', action: '确认生效', desc: '提交后分配关系立即生效', tip: '可继续处理剩余点' },
                                            ]}
                                            columns={[
                                                { title: '步骤', dataIndex: 'step', width: 50 },
                                                { title: '操作', dataIndex: 'action', width: 100 },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '提示', dataIndex: 'tip', width: 140 },
                                            ]}
                                        />
                                    </>
                                ),
                            },
                            {
                                key: 'commodity',
                                label: (
                                    <Space>
                                        <SettingOutlined style={{ color: '#722ed1' }} />
                                        <Text strong>品种分配说明</Text>
                                        <Tag color="purple">高级</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            type="warning"
                                            showIcon
                                            message="品种分配允许细粒度控制负责人的职责范围"
                                            style={{ marginBottom: 16 }}
                                        />

                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="什么是品种分配">
                                                <Space direction="vertical">
                                                    <Text>当一个采集点配置了多个品种时，可以精确指定负责人只负责其中的部分品种</Text>
                                                    <Text type="secondary">例如：锦州港有玉米和大豆两个品种，张三负责玉米，李四负责大豆</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="全品种  vs  指定品种">
                                                <Table
                                                    size="small"
                                                    pagination={false}
                                                    bordered
                                                    dataSource={[
                                                        { mode: '全品种', desc: '负责该采集点的所有品种', scenario: '单人负责全站点', result: '生成一条「全品种」分配记录' },
                                                        { mode: '指定品种', desc: '只负责选中的特定品种', scenario: '多人分工合作', result: '每个品种生成一条分配记录' },
                                                    ]}
                                                    columns={[
                                                        { title: '模式', dataIndex: 'mode', width: 80, render: (v) => <Tag>{v}</Tag> },
                                                        { title: '说明', dataIndex: 'desc' },
                                                        { title: '场景', dataIndex: 'scenario', width: 120 },
                                                        { title: '结果', dataIndex: 'result', width: 180 },
                                                    ]}
                                                />
                                            </Descriptions.Item>
                                            <Descriptions.Item label="如何操作">
                                                <Space direction="vertical">
                                                    <Text>1. 在分配采集点时，如果该点有多个品种，会弹出品种选择框</Text>
                                                    <Text>2. 不选择任何品种（或选「全品种」）= 负责所有品种</Text>
                                                    <Text>3. 选择特定品种 = 只负责选中的品种</Text>
                                                </Space>
                                            </Descriptions.Item>
                                        </Descriptions>
                                    </>
                                ),
                            },
                            {
                                key: 'stats',
                                label: (
                                    <Space>
                                        <TeamOutlined style={{ color: '#13c2c2' }} />
                                        <Text strong>统计与监控</Text>
                                        <Tag color="cyan">监控</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="顶部统计卡片">
                                                <Table
                                                    size="small"
                                                    pagination={false}
                                                    bordered
                                                    dataSource={[
                                                        { stat: '采集点总数', desc: '系统中所有采集点的数量', color: '灰色' },
                                                        { stat: '已分配', desc: '至少有一个负责人的采集点数量', color: '绿色' },
                                                        { stat: '未分配', desc: '尚无任何负责人的采集点数量', color: '红色' },
                                                        { stat: '分配率', desc: '已分配 / 总数 × 100%', color: '蓝色' },
                                                    ]}
                                                    columns={[
                                                        { title: '统计项', dataIndex: 'stat', width: 100 },
                                                        { title: '说明', dataIndex: 'desc' },
                                                        { title: '颜色', dataIndex: 'color', width: 60, render: (v) => <Tag>{v}</Tag> },
                                                    ]}
                                                />
                                            </Descriptions.Item>
                                            <Descriptions.Item label="用户负载指标">
                                                <Space direction="vertical">
                                                    <Text>• <Tag color="success">绿色（&lt;5点）</Tag>负载较轻，可增加分配</Text>
                                                    <Text>• <Tag color="warning">橙色（5-19点）</Tag>负载适中</Text>
                                                    <Text>• <Tag color="error">红色（≥20点）</Tag>负载较重，注意均衡</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="目标">
                                                <Text strong>分配率应达到 100%</Text>，确保每个采集点都有负责人
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
                        <Descriptions.Item label="Q: 一个采集点可以有多个负责人吗？">
                            可以。同一个采集点可以分配给多个人，尤其是当需要按品种分工时。系统会分别为每个分配创建任务。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 一个人可以负责多个采集点吗？">
                            可以。一个负责人可以被分配多个采集点，通过「按员工分配」模式可以方便地管理某人的所有采集点。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 分配后对方什么时候能看到？">
                            分配操作是<Text strong>实时生效</Text>的。负责人刷新页面即可看到新分配的采集点和相关任务。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 如何查看某人负责了哪些采集点？">
                            使用「按员工分配」模式 → 选中该员工 → 切换到「我负责」筛选，即可看到其所有负责的采集点。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 如何找出还没有分配的采集点？">
                            使用「按采集点分配」模式（默认只显示未分配），或在「按员工分配」模式下切换「未分配」筛选。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 分配和任务是什么关系？">
                            分配是「静态关系」，定义谁负责哪个点。任务是「动态工作」，由任务模板按周期生成。分配是任务分发的基础。
                        </Descriptions.Item>
                    </Descriptions>

                    <Divider />

                    {/* 最佳实践 */}
                    <Title level={4}>💡 最佳实践</Title>
                    <Alert
                        type="success"
                        showIcon
                        icon={<BulbOutlined />}
                        description={
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                <li><Text strong>定期检查分配率</Text>：保持分配率 100%，确保每个采集点都有负责人</li>
                                <li><Text strong>均衡负载</Text>：使用负载排序功能，避免某些人负责过多采集点</li>
                                <li><Text strong>及时更新</Text>：人员变动时及时调整分配，避免任务落空</li>
                                <li><Text strong>品种分工</Text>：对于多品种采集点，可以按品种分配给不同的专业人员</li>
                                <li><Text strong>区域负责</Text>：建议按区域或类型划分负责范围，便于管理</li>
                            </ul>
                        }
                    />
                </Typography>
            </Modal>
        </>
    );
};
