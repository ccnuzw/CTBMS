import React from 'react';
import { Popover, Space, Tag, Typography } from 'antd';
import { ClockCircleOutlined, LinkOutlined } from '@ant-design/icons';
import type { ConversationEvidenceItem } from '../api/conversations';
import { evidenceFreshnessColor, evidenceFreshnessLabel, evidenceQualityColor, evidenceQualityLabel } from './copilotChatConstants';

const { Text } = Typography;

interface EvidenceTagProps {
    /** 引用序号（从 1 开始） */
    index: number;
    /** 证据条目数据 */
    evidence: ConversationEvidenceItem;
}

/**
 * 内联引用标记组件（PRD §9.2 证据溯源标签）
 *
 * 在文本正文中以 [1] [2] 形式展示，
 * 点击/悬停弹出 Popover 展示证据摘要与来源信息。
 */
export const EvidenceTag: React.FC<EvidenceTagProps> = ({ index, evidence }) => {
    const popoverContent = (
        <div style={{ maxWidth: 320 }}>
            <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <Text strong style={{ fontSize: 13 }}>{evidence.title}</Text>
                <Space size={4} wrap>
                    <Tag>{evidence.source}</Tag>
                    <Tag color={evidenceFreshnessColor[evidence.freshness]}>
                        {evidenceFreshnessLabel[evidence.freshness]}
                    </Tag>
                    <Tag color={evidenceQualityColor[evidence.quality]}>
                        {evidenceQualityLabel[evidence.quality]}
                    </Tag>
                    {evidence.timestamp ? (
                        <Tag icon={<ClockCircleOutlined />} style={{ fontSize: 11 }}>
                            {new Date(evidence.timestamp).toLocaleDateString('zh-CN', {
                                month: '2-digit',
                                day: '2-digit',
                            })}
                        </Tag>
                    ) : null}
                </Space>
                <Text type="secondary" style={{ fontSize: 12, lineHeight: 1.5 }}>
                    {evidence.summary}
                </Text>
                {evidence.sourceUrl ? (
                    <a
                        href={evidence.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 12 }}
                    >
                        <LinkOutlined /> 查看来源
                    </a>
                ) : null}
            </Space>
        </div>
    );

    return (
        <Popover
            content={popoverContent}
            title={null}
            trigger="hover"
            placement="top"
            mouseEnterDelay={0.3}
        >
            <Tag
                color="processing"
                style={{
                    cursor: 'pointer',
                    fontSize: 11,
                    lineHeight: '16px',
                    padding: '0 4px',
                    margin: '0 1px',
                    borderRadius: 4,
                    verticalAlign: 'super',
                    fontWeight: 600,
                }}
            >
                {index}
            </Tag>
        </Popover>
    );
};
