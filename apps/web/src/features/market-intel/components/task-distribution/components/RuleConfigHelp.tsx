import React, { useState } from 'react';
import { Button, Modal, Typography, Table, Tag, Divider, Alert, Space, Descriptions } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';

const { Title, Paragraph, Text } = Typography;

/**
 * 规则配置帮助说明组件
 * 提供任务分发规则的详细配置说明
 */
export const RuleConfigHelp: React.FC = () => {
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
        title="任务分发规则配置说明"
        open={open}
        onCancel={() => setOpen(false)}
        footer={<Button onClick={() => setOpen(false)}>关闭</Button>}
        width={900}
        styles={{ body: { maxHeight: '70vh', overflowY: 'auto' } }}
      >
        <Typography>
          {/* 概述 */}
          <Alert
            type="info"
            showIcon
            message="规则说明"
            description="任务分发规则用于定义任务的自动生成方式。每个模板可以配置多条规则，规则之间相互独立执行。"
            style={{ marginBottom: 24 }}
          />

          {/* 范围配置 */}
          <Title level={4}>📍 范围 (Scope)</Title>
          <Paragraph>定义任务分发的目标对象范围。</Paragraph>
          <Table
            size="small"
            pagination={false}
            bordered
            dataSource={[
              { key: 'POINT', name: '采集点', desc: '按采集点分发任务，可选择采集点类型或指定具体采集点' },
              { key: 'USER', name: '人员', desc: '直接指定人员列表，每人生成一个任务' },
              { key: 'DEPARTMENT', name: '部门', desc: '按部门分发，部门下所有成员各生成一个任务' },
              { key: 'ORGANIZATION', name: '组织', desc: '按组织分发，组织下所有成员各生成一个任务' },
              { key: 'ROLE', name: '角色', desc: '按角色分发，该角色的所有用户各生成一个任务' },
              { key: 'QUERY', name: '复合条件', desc: '组合多种条件（人员+部门+组织+角色+采集点）' },
            ]}
            columns={[
              { title: '类型', dataIndex: 'key', width: 100, render: (v) => <Tag>{v}</Tag> },
              { title: '名称', dataIndex: 'name', width: 80 },
              { title: '说明', dataIndex: 'desc' },
            ]}
          />

          <Divider />

          {/* 频率配置 */}
          <Title level={4}>⏰ 频率 (Frequency)</Title>
          <Paragraph>定义任务生成的周期。</Paragraph>
          <Table
            size="small"
            pagination={false}
            bordered
            dataSource={[
              { key: 'DAILY', name: '每日', desc: '每天生成任务，在指定的下发时间执行' },
              { key: 'WEEKLY', name: '每周', desc: '每周指定日期生成任务，需配置"每周几"（1-7 表示周一到周日）' },
              { key: 'MONTHLY', name: '每月', desc: '每月指定日期生成任务，需配置"每月几号"（1-31，0表示月末）' },
              { key: 'ONE_TIME', name: '一次性', desc: '仅执行一次，适用于临时任务' },
            ]}
            columns={[
              { title: '类型', dataIndex: 'key', width: 100, render: (v) => <Tag color="blue">{v}</Tag> },
              { title: '名称', dataIndex: 'name', width: 80 },
              { title: '说明', dataIndex: 'desc' },
            ]}
          />

          <Divider />

          {/* 分配策略 */}
          <Title level={4}>👤 分配策略 (Assignee Strategy)</Title>
          <Paragraph>定义如何为任务选择执行人。</Paragraph>
          <Table
            size="small"
            pagination={false}
            bordered
            dataSource={[
              {
                key: 'POINT_OWNER',
                name: '采集点负责人',
                desc: '自动分配给采集点的负责人。如果采集点有多个负责人，每人各生成一个任务',
                usage: '适用于采集点类型的任务',
              },
              {
                key: 'ROTATION',
                name: '轮值',
                desc: '在候选人中轮流分配，保证每人分配机会均等',
                usage: '适用于多人共同负责的场景',
              },
              {
                key: 'BALANCED',
                name: '负载均衡',
                desc: '优先分配给当前任务数最少的人，实现负载均衡',
                usage: '适用于工作量不均的场景',
              },
              {
                key: 'USER_POOL',
                name: '人员池',
                desc: '使用范围中定义的所有人员，每人各生成一个任务',
                usage: '适用于手动指定人员的场景',
              },
            ]}
            columns={[
              { title: '类型', dataIndex: 'key', width: 130, render: (v) => <Tag color="green">{v}</Tag> },
              { title: '名称', dataIndex: 'name', width: 100 },
              { title: '说明', dataIndex: 'desc' },
              { title: '适用场景', dataIndex: 'usage', width: 180 },
            ]}
          />

          <Divider />

          {/* 完成策略 - 重点说明 */}
          <Title level={4}>✅ 完成策略 (Completion Policy)</Title>
          <Alert
            type="warning"
            showIcon
            message="重要提示"
            description="使用「任一人」「达标数」「全员」策略时，必须同时开启「生成任务组」开关，否则策略不会生效！"
            style={{ marginBottom: 16 }}
          />
          <Paragraph>定义多人任务时如何判定整体完成。</Paragraph>
          <Table
            size="small"
            pagination={false}
            bordered
            dataSource={[
              {
                key: 'EACH',
                name: '每人',
                behavior: '每个任务独立，互不影响',
                scenario: '需要每人独立填报数据',
                example: '10人各自提交，10个任务各自完成',
              },
              {
                key: 'ANY_ONE',
                name: '任一人',
                behavior: '任一人完成后，同组其他人任务自动标记为完成',
                scenario: '采集点只需一份数据即可',
                example: '10人中1人完成，其余9人任务自动完成',
              },
              {
                key: 'QUORUM',
                name: '达标数',
                behavior: '达到指定人数或比例后，剩余任务自动完成',
                scenario: '需要冗余验证但不需全员',
                example: '10人中3人完成(达标数=3)，其余7人任务自动完成',
              },
              {
                key: 'ALL',
                name: '全员',
                behavior: '所有人必须完成，任务组才算完成',
                scenario: '需要所有人都参与',
                example: '10人必须全部完成，任务组才完成',
              },
            ]}
            columns={[
              { title: '类型', dataIndex: 'key', width: 90, render: (v) => <Tag color="orange">{v}</Tag> },
              { title: '名称', dataIndex: 'name', width: 70 },
              { title: '行为说明', dataIndex: 'behavior', width: 220 },
              { title: '适用场景', dataIndex: 'scenario', width: 160 },
              { title: '示例', dataIndex: 'example' },
            ]}
          />

          <Divider />

          {/* 达标数配置 */}
          <Title level={4}>📊 达标数配置 (QUORUM)</Title>
          <Paragraph>当完成策略选择「达标数」时，需要配置完成条件：</Paragraph>
          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="达标数">
              <Space direction="vertical">
                <Text>指定需要完成的具体人数，如：<Tag>3</Tag></Text>
                <Text type="secondary">表示至少3人完成后，剩余任务自动完成</Text>
              </Space>
            </Descriptions.Item>
            <Descriptions.Item label="达标比例">
              <Space direction="vertical">
                <Text>指定需要完成的比例，如：<Tag>0.6</Tag></Text>
                <Text type="secondary">表示至少60%的人完成后，剩余任务自动完成</Text>
              </Space>
            </Descriptions.Item>
          </Descriptions>
          <Paragraph type="secondary" style={{ marginTop: 8 }}>
            * 如果同时配置了达标数和达标比例，优先使用达标数
          </Paragraph>

          <Divider />

          {/* 任务组 */}
          <Title level={4}>📦 生成任务组 (Grouping)</Title>
          <Paragraph>
            开启后，同一批次生成的任务会归入同一个任务组。任务组是完成策略生效的前提条件。
          </Paragraph>
          <Alert
            type="success"
            showIcon
            message="使用建议"
            description={
              <ul style={{ margin: 0, paddingLeft: 20 }}>
                <li>如果使用「每人」策略，可以不开启任务组</li>
                <li>如果使用「任一人」「达标数」「全员」策略，必须开启任务组</li>
                <li>任务组便于统计分析和批量管理</li>
              </ul>
            }
          />

          <Divider />

          {/* 常见问题 */}
          <Title level={4}>❓ 常见问题</Title>

          <Descriptions bordered size="small" column={1}>
            <Descriptions.Item label="Q: 审核价格后需要手动确认任务完成吗？">
              <Text type="success">不需要。</Text> 系统会自动同步：价格审核通过 → 任务自动完成；价格审核拒绝 → 任务自动标记为返工。
            </Descriptions.Item>
            <Descriptions.Item label="Q: 一人完成后其他人任务没有自动完成？">
              请检查是否同时满足：① 完成策略设为「任一人」② 开启了「生成任务组」开关
            </Descriptions.Item>
            <Descriptions.Item label="Q: 如何实现一个采集点只需一份数据？">
              配置：范围=采集点，分配策略=采集点负责人，完成策略=任一人，生成任务组=开启
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
                scenario: '每日价格采集（一点一数据）',
                scope: '采集点',
                assignee: '采集点负责人',
                completion: '任一人',
                grouping: '开启',
              },
              {
                scenario: '每日价格采集（多人交叉验证）',
                scope: '采集点',
                assignee: '采集点负责人',
                completion: '达标数(2)',
                grouping: '开启',
              },
              {
                scenario: '每周调研报告（全员参与）',
                scope: '部门',
                assignee: '人员池',
                completion: '每人',
                grouping: '可选',
              },
              {
                scenario: '临时紧急任务',
                scope: '人员',
                assignee: '人员池',
                completion: '每人',
                grouping: '可选',
              },
            ]}
            columns={[
              { title: '场景', dataIndex: 'scenario', width: 200 },
              { title: '范围', dataIndex: 'scope', width: 80 },
              { title: '分配策略', dataIndex: 'assignee', width: 110 },
              { title: '完成策略', dataIndex: 'completion', width: 100 },
              { title: '任务组', dataIndex: 'grouping', width: 70 },
            ]}
          />
        </Typography>
      </Modal>
    </>
  );
};
