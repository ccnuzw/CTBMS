import { PageContainer } from '@ant-design/pro-components';
import { MappingRuleList } from './components/MappingRuleList';
import { Alert } from 'antd';

export const MappingRuleCenter = () => {
    return (
        <PageContainer
            header={{
                title: '业务映射规则配置',
            }}
            content={
                <Alert
                    message="配置系统内置的数据清洗、情感分析等字典及映射规则"
                    description="例如：增加 'SENTIMENT' 的 '包含' 规则，模式填 '大涨'，目标填 'positive'，从而指导 LLM 分析输出标准化。"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
            }
        >
            <MappingRuleList />
        </PageContainer>
    );
};
