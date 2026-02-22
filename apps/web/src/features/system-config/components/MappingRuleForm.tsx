import { ProForm, ProFormText, ProFormSelect, ProFormSwitch, ProFormDigit, ProFormTextArea } from '@ant-design/pro-components';
import { CreateMappingRuleDTO, UpdateMappingRuleDTO } from '../types';

interface MappingRuleFormProps {
    initialValues?: Partial<CreateMappingRuleDTO> | UpdateMappingRuleDTO;
    mode: 'create' | 'edit';
}

export const MappingRuleForm: React.FC<MappingRuleFormProps> = ({ initialValues, mode }) => {
    return (
        <ProForm
            submitter={false}
            layout="vertical"
            initialValues={{
                isActive: true,
                priority: 1,
                matchMode: 'CONTAINS',
                ...initialValues,
            }}
        >
            <ProFormSelect
                name="domain"
                label="业务域 (Domain)"
                placeholder="请选择或输入业务域"
                rules={[{ required: true, message: '业务域是必填项' }]}
                allowClear
                fieldProps={{
                    showSearch: true,
                }}
                options={[
                    { label: 'SENTIMENT (情感分析)', value: 'SENTIMENT' },
                    { label: 'PRICE_SOURCE_TYPE (价格来源类型)', value: 'PRICE_SOURCE_TYPE' },
                    { label: 'PRICE_SUB_TYPE (价格细分类型)', value: 'PRICE_SUB_TYPE' },
                    { label: 'GEO_LEVEL (地理层级)', value: 'GEO_LEVEL' },
                    { label: 'CUSTOM (自定义...)', value: 'CUSTOM' }
                ]}
                tooltip="可以下拉选择系统内置字典，也可以手动输入新域。"
            />

            <ProFormSelect
                name="matchMode"
                label="匹配模式 (Match Mode)"
                placeholder="请选择匹配模式"
                rules={[{ required: true, message: '匹配模式必须选择' }]}
                options={[
                    { label: '包含匹配 (CONTAINS)', value: 'CONTAINS' },
                    { label: '精确匹配 (EXACT)', value: 'EXACT' },
                    { label: '正则表达式 (REGEX)', value: 'REGEX' },
                ]}
                tooltip="推荐使用 CONTAINS（如：文本包含'暴涨'则判定为积极）"
            />

            <ProFormText
                name="pattern"
                label="匹配规则 / 关键词 (Pattern)"
                placeholder="例如：暴涨、大跌、(?i)increase"
                rules={[{ required: true, message: '匹配规则不能为空' }]}
                tooltip="需要匹配的目标文本片段或正则模式"
            />

            <ProFormText
                name="targetValue"
                label="目标映射值 (Target Value)"
                placeholder="例如：positive, negative"
                rules={[{ required: true, message: '目标映射值不能为空' }]}
                tooltip="匹配成功后系统实际采用的标准值"
            />

            <ProFormDigit
                name="priority"
                label="执行优先级 (Priority)"
                placeholder="优先级，数字越大越优先"
                rules={[{ required: true, message: '优先级不能为空' }]}
                min={1}
                max={100}
                tooltip="当一条文本可能命中多条规则时，数字大的规则先生效"
            />

            <ProFormSwitch
                name="isActive"
                label="状态"
                checkedChildren="启用"
                unCheckedChildren="禁用"
            />

            <ProFormTextArea
                name="description"
                label="内部备注 (Description)"
                placeholder="选填，关于这条规则的补充说明"
            />
        </ProForm>
    );
};
