import React from 'react';
import { Card, Tag, Space, Typography, Row, Col, Pagination, Spin, Empty, theme, Flex } from 'antd';
import { EnvironmentOutlined, UserOutlined, BankOutlined } from '@ant-design/icons';
import { EnterpriseType, EnterpriseResponse } from '@packages/types';

const { Text, Paragraph } = Typography;
const { useToken } = theme;

// 企业类型颜色映射
const TYPE_COLORS: Record<EnterpriseType, string> = {
    [EnterpriseType.SUPPLIER]: 'orange',
    [EnterpriseType.CUSTOMER]: 'green',
    [EnterpriseType.LOGISTICS]: 'blue',
    [EnterpriseType.GROUP]: 'purple',
};

// 企业类型中文映射
const TYPE_LABELS: Record<EnterpriseType, string> = {
    [EnterpriseType.SUPPLIER]: '供应商',
    [EnterpriseType.CUSTOMER]: '客户',
    [EnterpriseType.LOGISTICS]: '物流商',
    [EnterpriseType.GROUP]: '集团',
};

interface EnterpriseCardGridProps {
    data: EnterpriseResponse[];
    loading: boolean;
    total: number;
    page: number;
    pageSize: number;
    onPageChange: (page: number, pageSize: number) => void;
    onSelect: (id: string | null) => void;
    selectedId: string | null;
}

export const EnterpriseCardGrid: React.FC<EnterpriseCardGridProps> = ({
    data,
    loading,
    total,
    page,
    pageSize,
    onPageChange,
    onSelect,
    selectedId,
}) => {
    const { token } = useToken();

    // 获取信用评分颜色
    const getRiskScoreColor = (score: number) => {
        if (score >= 90) return token.colorSuccess;
        if (score >= 70) return token.colorWarning;
        return token.colorError;
    };

    if (loading) {
        return (
            <Flex justify="center" align="center" style={{ height: 300 }}>
                <Spin size="large" />
            </Flex>
        );
    }

    if (data.length === 0) {
        return (
            <Flex justify="center" align="center" style={{ height: 300 }}>
                <Empty description="暂无客商数据" />
            </Flex>
        );
    }

    return (
        <div style={{ padding: token.padding }}>
            <Row gutter={[token.marginMD, token.marginMD]}>
                {data.map((enterprise) => (
                    <Col key={enterprise.id} xs={24} sm={12} lg={8} xl={6}>
                        <Card
                            hoverable
                            size="small"
                            onClick={() => onSelect(enterprise.id)}
                            style={{
                                borderColor: enterprise.id === selectedId ? token.colorPrimary : undefined,
                                boxShadow: enterprise.id === selectedId ? `0 0 0 2px ${token.colorPrimaryBg}` : undefined,
                            }}
                            bodyStyle={{ padding: token.paddingSM }}
                        >
                            {/* 头部：集团标记 */}
                            {enterprise.types.includes(EnterpriseType.GROUP) && (
                                <Tag
                                    color="purple"
                                    style={{
                                        position: 'absolute',
                                        top: 8,
                                        right: 8,
                                        margin: 0,
                                    }}
                                >
                                    集团
                                </Tag>
                            )}

                            {/* 企业名称 */}
                            <Text strong style={{ fontSize: token.fontSizeLG, display: 'block' }}>
                                {enterprise.name}
                            </Text>

                            {/* 业务身份标签 */}
                            <Space size={4} style={{ marginTop: token.marginXS }} wrap>
                                {enterprise.types
                                    .filter((t) => t !== EnterpriseType.GROUP)
                                    .map((type) => (
                                        <Tag key={type} color={TYPE_COLORS[type]} bordered={false}>
                                            {TYPE_LABELS[type]}
                                        </Tag>
                                    ))}
                            </Space>

                            {/* 信用分 + 地址 */}
                            <Flex
                                justify="space-between"
                                align="center"
                                style={{ marginTop: token.marginSM }}
                            >
                                <Text
                                    strong
                                    style={{
                                        color: getRiskScoreColor(enterprise.riskScore),
                                        fontSize: token.fontSizeSM,
                                    }}
                                >
                                    评分: {enterprise.riskScore}
                                </Text>
                                {enterprise.address && (
                                    <Text
                                        type="secondary"
                                        style={{ fontSize: token.fontSizeSM }}
                                        ellipsis
                                    >
                                        <EnvironmentOutlined style={{ marginRight: 4 }} />
                                        {enterprise.city || enterprise.province || enterprise.address}
                                    </Text>
                                )}
                            </Flex>

                            {/* 描述 */}
                            {enterprise.description && (
                                <Paragraph
                                    type="secondary"
                                    ellipsis={{ rows: 2 }}
                                    style={{ marginTop: token.marginXS, marginBottom: 0, fontSize: token.fontSizeSM }}
                                >
                                    {enterprise.description}
                                </Paragraph>
                            )}

                            {/* 底部统计 */}
                            <Flex
                                gap={token.marginSM}
                                style={{
                                    marginTop: token.marginSM,
                                    paddingTop: token.paddingXS,
                                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                                }}
                            >
                                <Space size={4}>
                                    <UserOutlined style={{ color: token.colorTextSecondary }} />
                                    <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                        {enterprise._count?.contacts ?? 0} 联系人
                                    </Text>
                                </Space>
                                {enterprise._count && enterprise._count.children > 0 && (
                                    <Space size={4}>
                                        <BankOutlined style={{ color: token.colorTextSecondary }} />
                                        <Text type="secondary" style={{ fontSize: token.fontSizeSM }}>
                                            {enterprise._count.children} 子公司
                                        </Text>
                                    </Space>
                                )}
                            </Flex>
                        </Card>
                    </Col>
                ))}
            </Row>

            {/* 分页 */}
            <Flex justify="center" style={{ marginTop: token.marginLG }}>
                <Pagination
                    current={page}
                    pageSize={pageSize}
                    total={total}
                    showSizeChanger
                    showQuickJumper
                    showTotal={(t) => `共 ${t} 条`}
                    onChange={onPageChange}
                />
            </Flex>
        </div>
    );
};

export default EnterpriseCardGrid;
