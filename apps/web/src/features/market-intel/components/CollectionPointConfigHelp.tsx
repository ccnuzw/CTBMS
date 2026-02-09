import React, { useState } from 'react';
import { Button, Modal, Typography, Table, Tag, Divider, Alert, Space, Descriptions, Collapse, theme } from 'antd';
import {
    QuestionCircleOutlined,
    ShopOutlined,
    ClockCircleOutlined,
    EnvironmentOutlined,
    TagsOutlined,
    RobotOutlined,
    SettingOutlined,
    TeamOutlined,
    BulbOutlined,
} from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

/**
 * 采集点配置详细帮助说明组件
 * 提供采集点各配置项的超详细说明
 */
export const CollectionPointConfigHelp: React.FC = () => {
    const [open, setOpen] = useState(false);
    const { token } = theme.useToken();

    return (
        <>
            <Button
                type="text"
                icon={<QuestionCircleOutlined />}
                onClick={() => setOpen(true)}
            >
                使用说明
            </Button>

            <Modal
                title="采集点配置完整说明"
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
                        message="采集点核心概念"
                        description="采集点是商情系统的核心数据节点，代表需要监测价格和信息的实体。它既是 AI 智能分析的关键词库，也是任务分发的基础单元。配置准确的采集点是系统高效运行的关键。"
                        style={{ marginBottom: 24 }}
                    />

                    <Collapse
                        defaultActiveKey={['basic', 'business', 'ai']}
                        items={[
                            {
                                key: 'basic',
                                label: (
                                    <Space>
                                        <ShopOutlined style={{ color: '#1890ff' }} />
                                        <Text strong>基本信息</Text>
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
                                                    key: 'code',
                                                    field: '编码',
                                                    required: '是',
                                                    desc: '采集点的唯一标识，创建后不可修改',
                                                    format: '仅支持大写字母、数字、下划线',
                                                    example: 'JINZHOU_PORT, ENT_ZHONGLIANG_GZL',
                                                },
                                                {
                                                    key: 'name',
                                                    field: '名称',
                                                    required: '是',
                                                    desc: '采集点的正式名称，会显示在任务卡片和报表中',
                                                    format: '2-50个字符',
                                                    example: '锦州港、中粮生化公主岭公司',
                                                },
                                                {
                                                    key: 'shortName',
                                                    field: '简称',
                                                    required: '否',
                                                    desc: '用于紧凑展示场景，如表格列、标签等',
                                                    format: '2-10个字符',
                                                    example: '锦州、公主岭中粮',
                                                },
                                                {
                                                    key: 'type',
                                                    field: '类型',
                                                    required: '是',
                                                    desc: '采集点的业务分类，决定在任务模板中如何选择',
                                                    format: '单选',
                                                    example: '企业、港口、站点、市场、地区',
                                                },
                                                {
                                                    key: 'aliases',
                                                    field: '别名',
                                                    required: '否',
                                                    desc: '用于 AI 精准匹配的专有名词变体列表',
                                                    format: '按回车或逗号分隔',
                                                    example: '锦港、锦州港口、JINZHOU',
                                                },
                                            ]}
                                            columns={[
                                                { title: '字段', dataIndex: 'field', width: 80 },
                                                { title: '必填', dataIndex: 'required', width: 50, render: (v) => v === '是' ? <Tag color="red">是</Tag> : <Tag>否</Tag> },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '格式', dataIndex: 'format', width: 150 },
                                                { title: '示例', dataIndex: 'example', width: 200 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>采集点类型详解</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'ENTERPRISE',
                                                    type: '🏭 企业',
                                                    color: 'orange',
                                                    desc: '淀粉厂、深加工企业、贸易商等',
                                                    scenario: '收购价、挂牌价采集',
                                                    example: '中粮生化公主岭、象屿玉米',
                                                },
                                                {
                                                    key: 'PORT',
                                                    type: '⚓ 港口',
                                                    color: 'blue',
                                                    desc: '海港、河港、内陆港等',
                                                    scenario: '到港价、平舱价采集',
                                                    example: '锦州港、鲅鱼圈港、广州港',
                                                },
                                                {
                                                    key: 'STATION',
                                                    type: '🚉 站点',
                                                    color: 'purple',
                                                    desc: '火车站、物流集散地等',
                                                    scenario: '站台价采集',
                                                    example: '四平站、公主岭站',
                                                },
                                                {
                                                    key: 'MARKET',
                                                    type: '🏪 市场',
                                                    color: 'green',
                                                    desc: '批发市场、交易市场',
                                                    scenario: '批发价、成交价采集',
                                                    example: '杨凌粮食批发市场',
                                                },
                                                {
                                                    key: 'REGION',
                                                    type: '📍 地区',
                                                    color: 'cyan',
                                                    desc: '行政区划或自定义区域',
                                                    scenario: '区域综合价格汇总',
                                                    example: '吉林东部、黑龙江南部',
                                                },
                                            ]}
                                            columns={[
                                                { title: '类型', dataIndex: 'type', width: 100 },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '应用场景', dataIndex: 'scenario', width: 140 },
                                                { title: '示例', dataIndex: 'example', width: 180 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>别名配置技巧</Divider>
                                        <Alert
                                            type="success"
                                            showIcon
                                            icon={<BulbOutlined />}
                                            message="别名越丰富，AI 识别准确率越高"
                                            style={{ marginBottom: 12 }}
                                        />
                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="什么是别名">
                                                <Space direction="vertical">
                                                    <Text>别名是<Text strong>采集点名称的变体</Text>，用于 AI 精准匹配日报中的实体</Text>
                                                    <Text type="secondary">例如：正式名称是"锦州港"，但日报可能写"锦港"或"JNZ"</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="怎么设置别名">
                                                <Space direction="vertical">
                                                    <Text>• <Text strong>简称</Text>：锦港、鲅港、中粮</Text>
                                                    <Text>• <Text strong>拼音/缩写</Text>：JNZ、BYQ、ZLSH</Text>
                                                    <Text>• <Text strong>历史名称</Text>：老名字、曾用名</Text>
                                                    <Text>• <Text strong>常见错别字</Text>：锦洲港（"州"写成"洲"）</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="别名 vs 关键词">
                                                <Space direction="vertical">
                                                    <Text>• <Text strong>别名（强匹配）</Text>：见到"锦港"→立刻识别为"锦州港"</Text>
                                                    <Text>• <Text strong>关键词（弱匹配）</Text>：见到"东北港口"→结合上下文判断</Text>
                                                </Space>
                                            </Descriptions.Item>
                                        </Descriptions>
                                    </>
                                ),
                            },
                            {
                                key: 'schedule',
                                label: (
                                    <Space>
                                        <ClockCircleOutlined style={{ color: '#52c41a' }} />
                                        <Text strong>任务下发规则</Text>
                                        <Tag color="green">调度</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            type="info"
                                            showIcon
                                            message="采集点级别的任务下发规则"
                                            description="当任务模板选择「继承采集点频率」时，将使用此处配置的规则。不同采集点可以有不同的采集频率。"
                                            style={{ marginBottom: 16 }}
                                        />

                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'DAILY',
                                                    type: '每日',
                                                    desc: '每天在指定时间生成任务',
                                                    config: '仅需配置下发时间',
                                                    scenario: '港口每日报价、企业每日收购价',
                                                },
                                                {
                                                    key: 'WEEKLY',
                                                    type: '每周',
                                                    desc: '每周指定日期生成任务',
                                                    config: '选择周几（可多选）+ 下发时间',
                                                    scenario: '周度市场调研',
                                                },
                                                {
                                                    key: 'MONTHLY',
                                                    type: '每月',
                                                    desc: '每月指定日期生成任务',
                                                    config: '选择几号（可多选，0=月末）+ 下发时间',
                                                    scenario: '月度汇总报告',
                                                },
                                                {
                                                    key: 'CUSTOM',
                                                    type: '自定义排期',
                                                    desc: '灵活配置复杂的采集周期',
                                                    config: '指定日期列表 / 间隔天数',
                                                    scenario: '特殊节假日安排、不规则采集',
                                                },
                                            ]}
                                            columns={[
                                                { title: '频率', dataIndex: 'type', width: 100, render: (v) => <Tag color="geekblue">{v}</Tag> },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '配置项', dataIndex: 'config' },
                                                { title: '适用场景', dataIndex: 'scenario', width: 180 },
                                            ]}
                                        />

                                        <Divider orientation="left" plain>自定义排期详解</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: 'dates',
                                                    mode: '指定日期',
                                                    desc: '手动选择具体的采集日期列表',
                                                    example: '2024-03-01, 2024-03-15, 2024-04-01',
                                                    scenario: '不规则的季度采集',
                                                },
                                                {
                                                    key: 'interval',
                                                    mode: '间隔天数',
                                                    desc: '从起始日期开始，每隔N天采集一次',
                                                    example: '起始日期: 2024-01-01，间隔: 3天',
                                                    scenario: '隔日采集、每3天采集',
                                                },
                                            ]}
                                            columns={[
                                                { title: '模式', dataIndex: 'mode', width: 100, render: (v) => <Tag color="purple">{v}</Tag> },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '示例', dataIndex: 'example' },
                                                { title: '场景', dataIndex: 'scenario', width: 150 },
                                            ]}
                                        />

                                        <Descriptions bordered size="small" column={1} style={{ marginTop: 16 }}>
                                            <Descriptions.Item label="任务生成时间">
                                                <Space direction="vertical">
                                                    <Text>到达该时间点后系统才会生成采集任务</Text>
                                                    <Text type="secondary">格式：HH:mm（如 09:00 表示上午9点生成任务）</Text>
                                                    <Text type="warning">⚠️ 注意：这是任务<Text strong>生成</Text>时间，不是截止时间</Text>
                                                </Space>
                                            </Descriptions.Item>
                                        </Descriptions>
                                    </>
                                ),
                            },
                            {
                                key: 'geo',
                                label: (
                                    <Space>
                                        <EnvironmentOutlined style={{ color: '#fa541c' }} />
                                        <Text strong>地理信息</Text>
                                        <Tag color="volcano">可选</Tag>
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
                                                    key: 'address',
                                                    field: '详细地址',
                                                    desc: '采集点的实际地址，可用于后续地图展示',
                                                    format: '省/市/区 + 详细地址',
                                                    example: '辽宁省锦州市凌河区港口大道1号',
                                                },
                                                {
                                                    key: 'longitude',
                                                    field: '经度',
                                                    desc: '地理坐标经度，用于地图定位',
                                                    format: '-180 到 180，精确到6位小数',
                                                    example: '121.147749',
                                                },
                                                {
                                                    key: 'latitude',
                                                    field: '纬度',
                                                    desc: '地理坐标纬度，用于地图定位',
                                                    format: '-90 到 90，精确到6位小数',
                                                    example: '41.095110',
                                                },
                                                {
                                                    key: 'regionCode',
                                                    field: '关联行政区划',
                                                    desc: '关联标准行政区划代码，用于数据聚合统计',
                                                    format: '级联选择省/市/区县',
                                                    example: '辽宁省 / 锦州市 / 凌河区',
                                                },
                                            ]}
                                            columns={[
                                                { title: '字段', dataIndex: 'field', width: 110 },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '格式', dataIndex: 'format', width: 180 },
                                                { title: '示例', dataIndex: 'example', width: 200 },
                                            ]}
                                        />

                                        <Alert
                                            type="warning"
                                            showIcon
                                            message="「地区」类型采集点必须关联行政区划"
                                            description="当采集点类型为「地区」时，必须选择关联的行政区划，系统会自动将区划名称填充到采集点名称。"
                                            style={{ marginTop: 16 }}
                                        />
                                    </>
                                ),
                            },
                            {
                                key: 'business',
                                label: (
                                    <Space>
                                        <TagsOutlined style={{ color: '#722ed1' }} />
                                        <Text strong>品种与价格配置</Text>
                                        <Tag color="purple">核心</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            type="warning"
                                            showIcon
                                            message="这是采集点最核心的业务配置"
                                            description="品种配置决定了该采集点可以采集哪些商品、允许提交哪些类型的价格，并为 AI 提取提供校验规则。"
                                            style={{ marginBottom: 16 }}
                                        />

                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="配置项说明">
                                                <Table
                                                    size="small"
                                                    pagination={false}
                                                    bordered
                                                    dataSource={[
                                                        {
                                                            key: 'commodity',
                                                            field: '品种',
                                                            required: '是',
                                                            desc: '该采集点经营的商品品种',
                                                            options: '玉米、大豆、小麦、稻谷、高粱、大麦',
                                                        },
                                                        {
                                                            key: 'allowedSubTypes',
                                                            field: '允许的价格类型',
                                                            required: '是',
                                                            desc: '该品种在此采集点允许提交的价格类型白名单',
                                                            options: '挂牌价、成交价、到港价、平舱价、站台价、收购价、批发价、其他',
                                                        },
                                                        {
                                                            key: 'defaultSubType',
                                                            field: '默认价格类型',
                                                            required: '是',
                                                            desc: '当 AI 无法确定具体价格类型时使用的缺省值',
                                                            options: '必须从"允许的价格类型"中选择',
                                                        },
                                                    ]}
                                                    columns={[
                                                        { title: '配置项', dataIndex: 'field', width: 130 },
                                                        { title: '必填', dataIndex: 'required', width: 50, render: (v) => v === '是' ? <Tag color="red">是</Tag> : <Tag>否</Tag> },
                                                        { title: '说明', dataIndex: 'desc' },
                                                        { title: '可选值', dataIndex: 'options', width: 280 },
                                                    ]}
                                                />
                                            </Descriptions.Item>
                                        </Descriptions>

                                        <Divider orientation="left" plain>配置示例</Divider>
                                        <Table
                                            size="small"
                                            pagination={false}
                                            bordered
                                            dataSource={[
                                                {
                                                    key: '1',
                                                    point: '锦州港',
                                                    type: '港口',
                                                    commodity: '玉米',
                                                    allowed: '到港价、平舱价、成交价',
                                                    default: '到港价',
                                                },
                                                {
                                                    key: '2',
                                                    point: '中粮公主岭',
                                                    type: '企业',
                                                    commodity: '玉米',
                                                    allowed: '收购价、挂牌价',
                                                    default: '收购价',
                                                },
                                                {
                                                    key: '3',
                                                    point: '四平站',
                                                    type: '站点',
                                                    commodity: '玉米',
                                                    allowed: '站台价',
                                                    default: '站台价',
                                                },
                                            ]}
                                            columns={[
                                                { title: '采集点', dataIndex: 'point', width: 100 },
                                                { title: '类型', dataIndex: 'type', width: 60 },
                                                { title: '品种', dataIndex: 'commodity', width: 60 },
                                                { title: '允许的价格类型', dataIndex: 'allowed' },
                                                { title: '默认类型', dataIndex: 'default', width: 80 },
                                            ]}
                                        />

                                        <Alert
                                            type="info"
                                            showIcon
                                            icon={<BulbOutlined />}
                                            message="多品种配置"
                                            description="如果一个采集点经营多个品种，可以点击「添加经营品种」按钮添加多条配置。每个品种可以有独立的允许价格类型和默认类型。"
                                            style={{ marginTop: 16 }}
                                        />
                                    </>
                                ),
                            },
                            {
                                key: 'ai',
                                label: (
                                    <Space>
                                        <RobotOutlined style={{ color: '#13c2c2' }} />
                                        <Text strong>AI 智能提取配置</Text>
                                        <Tag color="cyan">AI</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            type="info"
                                            showIcon
                                            message="AI 如何使用采集点配置"
                                            description="当 AI 分析日报文本时，会使用采集点的名称、别名、关键词进行实体识别，并根据品种配置进行价格校验。"
                                            style={{ marginBottom: 16 }}
                                        />

                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="匹配机制">
                                                <ol style={{ margin: 0, paddingLeft: 20 }}>
                                                    <li><Text strong>第一步：实体识别</Text> - AI 在文本中寻找与采集点名称/别名匹配的关键词</li>
                                                    <li><Text strong>第二步：上下文分析</Text> - 结合关键词判断是否真的指向该采集点</li>
                                                    <li><Text strong>第三步：价格提取</Text> - 提取关联的价格数据</li>
                                                    <li><Text strong>第四步：类型校验</Text> - 检查价格类型是否在"允许的价格类型"白名单中</li>
                                                </ol>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="作为数据源">
                                                <Space direction="vertical">
                                                    <Text>标记该采集点是否是可信的价格/信息数据来源</Text>
                                                    <Text type="secondary">• 开启：AI 会将该采集点识别的数据标记为"可信来源"</Text>
                                                    <Text type="secondary">• 关闭：仅作为关键词匹配使用，不作为数据来源</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="匹配优先级(priority)">
                                                <Space direction="vertical">
                                                    <Text>当多个采集点同时匹配时，优先级高的优先</Text>
                                                    <Text type="secondary">数值范围：0-100，数值越大优先级越高</Text>
                                                    <Text type="warning">💡 建议：设置 0-10 即可，除非有特殊需求</Text>
                                                </Space>
                                            </Descriptions.Item>
                                        </Descriptions>

                                        <Divider orientation="left" plain>AI 匹配效果示例</Divider>
                                        <div style={{ background: token.colorBgLayout, padding: 16, borderRadius: 8 }}>
                                            <Paragraph style={{ marginBottom: 8 }}>
                                                <Text strong>日报原文：</Text>
                                            </Paragraph>
                                            <Paragraph style={{ background: token.colorBgContainer, padding: 12, borderRadius: 4, marginBottom: 12 }}>
                                                "锦港玉米今日到港价2150元/吨，较昨日上涨10元，贸易商积极出货。"
                                            </Paragraph>
                                            <Paragraph style={{ marginBottom: 8 }}>
                                                <Text strong>AI 识别结果：</Text>
                                            </Paragraph>
                                            <Table
                                                size="small"
                                                pagination={false}
                                                bordered
                                                dataSource={[
                                                    { key: '1', match: '锦港', point: '锦州港', reason: '别名匹配' },
                                                    { key: '2', match: '玉米', commodity: '玉米', reason: '品种匹配' },
                                                    { key: '3', match: '到港价', priceType: '到港价', reason: '价格类型识别' },
                                                    { key: '4', match: '2150元/吨', price: '2150', reason: '价格提取' },
                                                ]}
                                                columns={[
                                                    { title: '匹配文本', dataIndex: 'match', width: 100 },
                                                    { title: '识别结果', dataIndex: 'point', render: (_, r) => r.point || r.commodity || r.priceType || r.price },
                                                    { title: '匹配原因', dataIndex: 'reason' },
                                                ]}
                                            />
                                        </div>
                                    </>
                                ),
                            },
                            {
                                key: 'control',
                                label: (
                                    <Space>
                                        <SettingOutlined style={{ color: '#eb2f96' }} />
                                        <Text strong>控制设置</Text>
                                        <Tag color="magenta">管理</Tag>
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
                                                    key: 'priority',
                                                    field: '匹配优先级',
                                                    desc: '当多个采集点同时匹配日报中的文本时，优先级高的采集点优先被选中',
                                                    default: '0',
                                                    range: '0-100',
                                                },
                                                {
                                                    key: 'isActive',
                                                    field: '启用状态',
                                                    desc: '禁用后，该采集点不会出现在任务模板选择列表中，也不会被 AI 匹配',
                                                    default: '启用',
                                                    range: '启用/禁用',
                                                },
                                                {
                                                    key: 'description',
                                                    field: '备注',
                                                    desc: '内部备注信息，不影响系统功能',
                                                    default: '空',
                                                    range: '任意文本',
                                                },
                                            ]}
                                            columns={[
                                                { title: '字段', dataIndex: 'field', width: 100 },
                                                { title: '说明', dataIndex: 'desc' },
                                                { title: '默认值', dataIndex: 'default', width: 80 },
                                                { title: '取值范围', dataIndex: 'range', width: 100 },
                                            ]}
                                        />
                                    </>
                                ),
                            },
                            {
                                key: 'allocation',
                                label: (
                                    <Space>
                                        <TeamOutlined style={{ color: '#fa8c16' }} />
                                        <Text strong>人员分配</Text>
                                        <Tag color="orange">关联</Tag>
                                    </Space>
                                ),
                                children: (
                                    <>
                                        <Alert
                                            type="info"
                                            showIcon
                                            message="人员分配在「人员分配」标签页中进行"
                                            description="创建采集点后，需要在「人员分配」标签页中为其分配负责人。分配后，当任务模板选择「按采集点负责人」分配时，系统会自动将任务分发给对应的负责人。"
                                            style={{ marginBottom: 16 }}
                                        />

                                        <Descriptions bordered size="small" column={1}>
                                            <Descriptions.Item label="分配方式">
                                                <Space direction="vertical">
                                                    <Text>• <Text strong>按采集点分配</Text>：选择采集点 → 选择负责人 → 选择负责品种</Text>
                                                    <Text>• <Text strong>按人员分配</Text>：选择人员 → 批量选择采集点</Text>
                                                </Space>
                                            </Descriptions.Item>
                                            <Descriptions.Item label="品种分配">
                                                <Space direction="vertical">
                                                    <Text>可以指定负责人只负责某个采集点的特定品种</Text>
                                                    <Text type="secondary">例如：张三负责锦州港的玉米，李四负责锦州港的大豆</Text>
                                                    <Text type="secondary">如不选择具体品种，则默认为负责该采集点的所有品种</Text>
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
                        <Descriptions.Item label="Q: 采集点和任务有什么关系？">
                            采集点是任务的目标对象。任务模板可以选择「按采集点负责人」分配任务，系统会自动为每个采集点的负责人生成独立的任务。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 为什么要设置别名？">
                            因为日报中可能使用简称、拼音、历史名称等方式提到同一个实体。设置丰富的别名可以提高 AI 识别的准确率。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 品种配置有什么用？">
                            品种配置决定了该采集点可以采集哪些商品，以及每个商品允许提交哪些价格类型。这既是业务规则，也是 AI 校验规则。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 采集频率在哪里生效？">
                            当任务模板选择「继承采集点频率」作为频率来源时，系统会使用采集点自身配置的频率来生成任务。
                        </Descriptions.Item>
                        <Descriptions.Item label="Q: 如何禁用一个采集点？">
                            将「启用状态」切换为「禁用」即可。禁用后该采集点不会出现在任务模板选择列表中，也不会被 AI 匹配。
                        </Descriptions.Item>
                    </Descriptions>

                    <Divider />

                    {/* 配置检查清单 */}
                    <Title level={4}>✅ 配置检查清单</Title>
                    <Alert
                        type="success"
                        showIcon
                        description={
                            <ul style={{ margin: 0, paddingLeft: 20 }}>
                                <li>编码唯一且符合规范（大写字母+数字+下划线）</li>
                                <li>名称清晰准确</li>
                                <li>类型选择正确</li>
                                <li>别名列表包含常见变体</li>
                                <li>已配置经营品种和允许的价格类型</li>
                                <li>每个品种都设置了默认价格类型</li>
                                <li>已分配负责人（在人员分配标签页）</li>
                                <li>状态为"启用"</li>
                            </ul>
                        }
                    />
                </Typography>
            </Modal>
        </>
    );
};
