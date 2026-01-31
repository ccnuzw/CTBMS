import React, { useState, useEffect } from 'react';
import { Modal, Select, Typography } from 'antd';
import { useUpdateMarketIntelTags } from '../../api/hooks';

const { Text } = Typography;

interface EditTagsModalProps {
    open: boolean;
    onClose: () => void;
    docId: string;
    initialTags: string[];
    onSuccess?: (newTags: string[]) => void;
}

export const EditTagsModal: React.FC<EditTagsModalProps> = ({
    open,
    onClose,
    docId,
    initialTags,
    onSuccess
}) => {
    const [tags, setTags] = useState<string[]>([]);
    const updateTagsMutation = useUpdateMarketIntelTags();

    useEffect(() => {
        if (open) {
            setTags(initialTags || []);
        }
    }, [open, initialTags]);

    const handleOk = () => {
        updateTagsMutation.mutate({ id: docId, tags }, {
            onSuccess: () => {
                onSuccess?.(tags);
                onClose();
            }
        });
    };

    return (
        <Modal
            title="编辑标签"
            open={open}
            onOk={handleOk}
            onCancel={onClose}
            confirmLoading={updateTagsMutation.isPending}
            width={400}
        >
            <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                添加或移除标签，用于模拟分类管理。
            </Text>
            <Select
                mode="tags"
                style={{ width: '100%' }}
                placeholder="输入标签并回车"
                value={tags}
                onChange={setTags}
                tokenSeparators={[',']}
            />
        </Modal>
    );
};
