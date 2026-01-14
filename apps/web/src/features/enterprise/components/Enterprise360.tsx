import React, { useState } from 'react';
import {
    Tabs,
    Typography,
    Space,
    Tag,
    Button,
    Descriptions,
    List,
    Avatar,
    Empty,
    Spin,
    Tooltip,
    Alert,
    Card,
    Divider,
    theme,
    Flex,
    App,
} from 'antd';
import {
    ArrowLeftOutlined,
    EditOutlined,
    CopyOutlined,
    UserOutlined,
    PhoneOutlined,
    MailOutlined,
    DashboardOutlined,
    BankOutlined,
    TeamOutlined,
    SafetyCertificateOutlined,
    ExclamationCircleOutlined,
    ApartmentOutlined,
} from '@ant-design/icons';
import {
    EnterpriseType,
    EnterpriseResponse,
    ContactRole,
    ContactResponse,
    BankAccountResponse,
} from '@packages/types';
import { useEnterprise } from '../api';

const { Title, Text, Paragraph } = Typography;
const { useToken } = theme;

// 联系人角色中文映射
const ROLE_LABELS: Record<ContactRole, string> = {
    [ContactRole.PROCUREMENT]: '采购决策线',
    [ContactRole.EXECUTION]: '执行运营线',
    [ContactRole.FINANCE]: '财务结算线',
    [ContactRole.MANAGEMENT]: '高层管理线',
};

const ROLE_COLORS: Record<ContactRole, string> = {
    [ContactRole.PROCUREMENT]: 'blue',
    [ContactRole.EXECUTION]: 'orange',
    [ContactRole.FINANCE]: 'green',
    [ContactRole.MANAGEMENT]: 'purple',
};

// 企业类型中文映射
const TYPE_LABELS: Record<EnterpriseType, string> = {
    [EnterpriseType.SUPPLIER]: '供应商',
    [EnterpriseType.CUSTOMER]: '客户',
    [EnterpriseType.LOGISTICS]: '物流商',
    [EnterpriseType.GROUP]: '集团',
};

interface Enterprise360Props {
    enterpriseId: string;
    onClose: () => void;
    onEdit: () => void;
}

export const Enterprise360: React.FC<Enterprise360Props> = ({
    enterpriseId,
    onClose,
    onEdit,
}) => {
    const { token } = useToken();
    const { message } = App.useApp();
    const [activeTab, setActiveTab] = useState('overview');

    const { data: enterprise, isLoading, error } = useEnterprise(enterpriseId);

    // 复制到剪贴板
    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text);
        message.success(`已复制${label}`);
    };

    // 获取信用评分颜色
    const getRiskScoreColor = (score: number) => {
        if (score >= 90) return token.colorSuccess;
        if (score >= 70) return token.colorWarning;
        return token.colorError;
    };

    if (isLoading) {
        return (
            <Flex justify="center" align="center" style={{ height: '100%' }}>
                <Spin size="large" />
            </Flex>
        );
    }

    if (error || !enterprise) {
        return (
            <Flex justify="center" align="center" style={{ height: '100%' }}>
                <Empty description="无法加载企业信息" />
            </Flex>
        );
    }

    // 按角色分组联系人
    const groupedContacts = (enterprise.contacts ?? []).reduce((acc, contact) => {
        const role = contact.role;
        if (!acc[role]) acc[role] = [];
        acc[role].push(contact);
        return acc;
    }, {} as Record<ContactRole, ContactResponse[]>);

    // Tab 内容定义
    const tabItems = [
        {
            key: 'overview',
            label: (
                <span>
                    <DashboardOutlined />
                    全景概览
                </span>
            ),
            children: (
                <div style={{ padding: token.paddingSM }}>
                    {/* 工商档案 */}
                    <Card size="small" title="工商档案" style={{ marginBottom: token.marginMD }}>
                        <Paragraph>{enterprise.description || '暂无描述'}</Paragraph>

                        <Descriptions column={1} size="small">
                            <Descriptions.Item label="统一社会信用代码">
                                <Text copyable={{ text: enterprise.taxId }}>{enterprise.taxId}</Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="注册地址">
                                {[enterprise.province, enterprise.city, enterprise.address]
                                    .filter(Boolean)
                                    .join(' ') || '-'}
                            </Descriptions.Item>
                        </Descriptions>

                        {/* 业务标签 */}
                        <Divider style={{ margin: `${token.marginSM}px 0` }} />
                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>业务身份</Text>
                        <div style={{ marginTop: token.marginXS }}>
                            {enterprise.types.map((type) => (
                                <Tag key={type} color={type === EnterpriseType.GROUP ? 'purple' : 'default'}>
                                    {TYPE_LABELS[type]}
                                </Tag>
                            ))}
                        </div>
                    </Card>

                    {/* 组织架构 */}
                    <Card
                        size="small"
                        title={
                            <Space>
                                <ApartmentOutlined />
                                组织架构与关联
                            </Space>
                        }
                    >
                        {/* 上级集团 */}
                        {enterprise.parent && (
                            <div style={{ marginBottom: token.marginSM }}>
                                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                    上级集团
                                </Text>
                                <Card size="small" style={{ marginTop: token.marginXS, background: token.colorPrimaryBg }}>
                                    <Text strong>{enterprise.parent.name}</Text>
                                </Card>
                            </div>
                        )}

                        {/* 当前企业 */}
                        <div style={{ marginBottom: token.marginSM }}>
                            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                当前查看
                            </Text>
                            <Card
                                size="small"
                                style={{
                                    marginTop: token.marginXS,
                                    borderColor: token.colorPrimary,
                                    borderWidth: 2,
                                }}
                            >
                                <Text strong style={{ color: token.colorPrimary }}>{enterprise.name}</Text>
                            </Card>
                        </div>

                        {/* 下属公司 */}
                        {enterprise.children && enterprise.children.length > 0 && (
                            <div>
                                <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                    下属分公司 ({enterprise.children.length})
                                </Text>
                                <List
                                    size="small"
                                    dataSource={enterprise.children}
                                    renderItem={(child) => (
                                        <List.Item style={{ padding: `${token.paddingXS}px 0` }}>
                                            <Text>{child.name}</Text>
                                        </List.Item>
                                    )}
                                    style={{ marginTop: token.marginXS }}
                                />
                            </div>
                        )}

                        {!enterprise.parent && (!enterprise.children || enterprise.children.length === 0) && (
                            <Text type="secondary">独立法人企业，无集团关联</Text>
                        )}
                    </Card>
                </div>
            ),
        },
        {
            key: 'finance',
            label: (
                <span>
                    <BankOutlined />
                    财务沙箱
                </span>
            ),
            children: (
                <div style={{ padding: token.paddingSM }}>
                    {/* 防诈骗预警 */}
                    <Alert
                        message="防诈骗预警"
                        description="请务必向白名单账户打款。供应商变更账户需经过风控部二级审批。"
                        type="warning"
                        showIcon
                        icon={<ExclamationCircleOutlined />}
                        style={{ marginBottom: token.marginMD }}
                    />

                    {/* 开票资料 */}
                    <Card size="small" title="开票资料（点击复制）" style={{ marginBottom: token.marginMD }}>
                        <Descriptions column={1} size="small">
                            <Descriptions.Item label="公司全称">
                                <Text
                                    copyable={{
                                        text: enterprise.name,
                                        tooltips: ['点击复制', '已复制'],
                                    }}
                                >
                                    {enterprise.name}
                                </Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="税号">
                                <Text
                                    copyable={{
                                        text: enterprise.taxId,
                                        tooltips: ['点击复制', '已复制'],
                                    }}
                                    code
                                >
                                    {enterprise.taxId}
                                </Text>
                            </Descriptions.Item>
                            <Descriptions.Item label="注册地址">
                                {[enterprise.province, enterprise.city, enterprise.address]
                                    .filter(Boolean)
                                    .join(' ') || '-'}
                            </Descriptions.Item>
                        </Descriptions>
                    </Card>

                    {/* 银行账户白名单 */}
                    <Card size="small" title="银行账户白名单">
                        {enterprise.bankAccounts && enterprise.bankAccounts.length > 0 ? (
                            <List
                                dataSource={enterprise.bankAccounts}
                                renderItem={(account: BankAccountResponse) => (
                                    <List.Item
                                        style={{
                                            background: account.isWhitelisted ? undefined : token.colorErrorBg,
                                            padding: token.paddingSM,
                                            borderRadius: token.borderRadius,
                                            marginBottom: token.marginXS,
                                        }}
                                    >
                                        <List.Item.Meta
                                            avatar={<BankOutlined style={{ fontSize: 24, color: token.colorPrimary }} />}
                                            title={
                                                <Space>
                                                    <Text strong>{account.bankName}</Text>
                                                    {account.isDefault && <Tag color="blue">默认</Tag>}
                                                    {account.isWhitelisted ? (
                                                        <Tag color="green" icon={<SafetyCertificateOutlined />}>
                                                            已验证
                                                        </Tag>
                                                    ) : (
                                                        <Tag color="red">未验证</Tag>
                                                    )}
                                                </Space>
                                            }
                                            description={
                                                <Text
                                                    copyable={{
                                                        text: account.accountNumber,
                                                        tooltips: ['点击复制', '已复制'],
                                                    }}
                                                    code
                                                    style={{ fontSize: token.fontSizeLG }}
                                                >
                                                    {account.accountNumber}
                                                </Text>
                                            }
                                        />
                                    </List.Item>
                                )}
                            />
                        ) : (
                            <Empty description="暂无登记账户信息" />
                        )}
                    </Card>
                </div>
            ),
        },
        {
            key: 'contacts',
            label: (
                <span>
                    <TeamOutlined />
                    职能通讯录
                </span>
            ),
            children: (
                <div style={{ padding: token.paddingSM }}>
                    {Object.entries(groupedContacts).length > 0 ? (
                        Object.entries(ROLE_LABELS).map(([role, label]) => {
                            const contacts = groupedContacts[role as ContactRole];
                            if (!contacts || contacts.length === 0) return null;

                            return (
                                <Card
                                    key={role}
                                    size="small"
                                    title={
                                        <Space>
                                            <Tag color={ROLE_COLORS[role as ContactRole]}>{label}</Tag>
                                            <Text type="secondary">{contacts.length} 人</Text>
                                        </Space>
                                    }
                                    style={{ marginBottom: token.marginMD }}
                                >
                                    <List
                                        dataSource={contacts}
                                        renderItem={(contact: ContactResponse) => (
                                            <List.Item>
                                                <List.Item.Meta
                                                    avatar={
                                                        <Avatar
                                                            style={{
                                                                backgroundColor: token[`color${ROLE_COLORS[contact.role].charAt(0).toUpperCase() + ROLE_COLORS[contact.role].slice(1)}` as keyof typeof token] as string || token.colorPrimary,
                                                            }}
                                                        >
                                                            {contact.name.charAt(0)}
                                                        </Avatar>
                                                    }
                                                    title={
                                                        <Space>
                                                            <Text strong>{contact.name}</Text>
                                                            {contact.title && (
                                                                <Text type="secondary">{contact.title}</Text>
                                                            )}
                                                        </Space>
                                                    }
                                                    description={
                                                        <Space split={<Divider type="vertical" />}>
                                                            <a href={`tel:${contact.phone}`}>
                                                                <PhoneOutlined /> {contact.phone}
                                                            </a>
                                                            {contact.email && (
                                                                <a href={`mailto:${contact.email}`}>
                                                                    <MailOutlined /> {contact.email}
                                                                </a>
                                                            )}
                                                        </Space>
                                                    }
                                                />
                                                {contact.notes && (
                                                    <Tag>{contact.notes}</Tag>
                                                )}
                                            </List.Item>
                                        )}
                                    />
                                </Card>
                            );
                        })
                    ) : (
                        <Empty description="暂无联系人记录" />
                    )}
                </div>
            ),
        },
    ];

    return (
        <div
            style={{
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: token.colorBgContainer,
            }}
        >
            {/* 头部 */}
            <div
                style={{
                    padding: token.padding,
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorBgLayout,
                }}
            >
                <Flex justify="space-between" align="start">
                    <div>
                        <Button
                            type="link"
                            icon={<ArrowLeftOutlined />}
                            onClick={onClose}
                            style={{ padding: 0, marginBottom: token.marginXS }}
                        >
                            返回列表
                        </Button>

                        <Title level={4} style={{ margin: 0 }}>
                            {enterprise.name}
                        </Title>

                        <Space style={{ marginTop: token.marginXS }}>
                            {enterprise.types.map((type) => (
                                <Tag key={type} color={type === EnterpriseType.GROUP ? 'purple' : 'blue'}>
                                    {TYPE_LABELS[type]}
                                </Tag>
                            ))}
                        </Space>

                        <div style={{ marginTop: token.marginXS }}>
                            <Text type="secondary">
                                税号: {enterprise.taxId}
                            </Text>
                        </div>
                    </div>

                    <div style={{ textAlign: 'right' }}>
                        <div>
                            <Text
                                strong
                                style={{
                                    fontSize: 28,
                                    color: getRiskScoreColor(enterprise.riskScore),
                                }}
                            >
                                {enterprise.riskScore}
                            </Text>
                            <br />
                            <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                信用评分
                            </Text>
                        </div>

                        <Button
                            type="primary"
                            icon={<EditOutlined />}
                            onClick={onEdit}
                            style={{ marginTop: token.marginMD }}
                        >
                            编辑信息
                        </Button>
                    </div>
                </Flex>
            </div>

            {/* Tab 内容 */}
            <Tabs
                activeKey={activeTab}
                onChange={setActiveTab}
                items={tabItems}
                style={{ flex: 1, overflow: 'hidden' }}
                tabBarStyle={{ padding: `0 ${token.padding}px`, margin: 0 }}
            />
        </div>
    );
};

export default Enterprise360;
