
import React from 'react';
import { Card, List, Empty } from 'antd';
import { useNavigate } from 'react-router-dom';

interface RelatedReportsProps {
    currentReportId: string;
    // In a real app, this would accept a list of related reports or fetch them
}

export const RelatedReports: React.FC<RelatedReportsProps> = () => {
    // Mock data or fetch later
    const navigate = useNavigate();

    return (
        <Card title="相关研报" bordered={false} className="shadow-sm">
            <List
                size="small"
                dataSource={[]} // Empty for now
                renderItem={(item: any) => (
                    <List.Item>
                        <List.Item.Meta
                            title={<a onClick={() => navigate(`/intel/research-reports/${item.id}`)}>{item.title}</a>}
                            description="2024-01-20"
                        />
                    </List.Item>
                )}
                locale={{ emptyText: <Empty description="暂无相关研报" image={Empty.PRESENTED_IMAGE_SIMPLE} /> }}
            />
        </Card>
    );
};
