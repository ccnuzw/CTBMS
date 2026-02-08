import React, { useState, useMemo } from 'react';
import { Modal, Tag, Flex, Input, Button, Space, Typography, Divider, Empty } from 'antd';
import { PlusOutlined, TagsOutlined } from '@ant-design/icons';
import { useModalAutoFocus } from '@/hooks/useModalAutoFocus';

const { Text } = Typography;

interface BatchTagModalProps {
    open: boolean;
    onClose: () => void;
    selectedIds: Set<string>;
    availableTags: string[];
    onApplyTags: (ids: string[], addTags: string[], removeTags: string[]) => void;
    isLoading?: boolean;
}

export const BatchTagModal: React.FC<BatchTagModalProps> = ({
    open,
    onClose,
    selectedIds,
    availableTags,
    onApplyTags,
    isLoading = false,
}) => {
    const [tagsToAdd, setTagsToAdd] = useState<Set<string>>(new Set());
    const [tagsToRemove, setTagsToRemove] = useState<Set<string>>(new Set());
    const [newTagInput, setNewTagInput] = useState('');
    const { containerRef, autoFocusFieldProps, modalProps } = useModalAutoFocus();

    const sortedTags = useMemo(() => {
        return [...availableTags].sort((a, b) => a.localeCompare(b));
    }, [availableTags]);

    const handleToggleAdd = (tag: string) => {
        const next = new Set(tagsToAdd);
        if (next.has(tag)) {
            next.delete(tag);
        } else {
            next.add(tag);
            // Remove from "remove" set if present
            const removeNext = new Set(tagsToRemove);
            removeNext.delete(tag);
            setTagsToRemove(removeNext);
        }
        setTagsToAdd(next);
    };

    const handleToggleRemove = (tag: string) => {
        const next = new Set(tagsToRemove);
        if (next.has(tag)) {
            next.delete(tag);
        } else {
            next.add(tag);
            // Remove from "add" set if present
            const addNext = new Set(tagsToAdd);
            addNext.delete(tag);
            setTagsToAdd(addNext);
        }
        setTagsToRemove(next);
    };

    const handleAddNewTag = () => {
        const trimmed = newTagInput.trim();
        if (trimmed && !tagsToAdd.has(trimmed)) {
            setTagsToAdd(new Set([...tagsToAdd, trimmed]));
            setNewTagInput('');
        }
    };

    const handleApply = () => {
        onApplyTags(
            Array.from(selectedIds),
            Array.from(tagsToAdd),
            Array.from(tagsToRemove)
        );
        handleReset();
    };

    const handleReset = () => {
        setTagsToAdd(new Set());
        setTagsToRemove(new Set());
        setNewTagInput('');
    };

    const handleClose = () => {
        handleReset();
        onClose();
    };

    const getTagColor = (tag: string) => {
        if (tagsToAdd.has(tag)) return 'success';
        if (tagsToRemove.has(tag)) return 'error';
        return 'default';
    };

    const getTagStyle = (tag: string): React.CSSProperties => {
        if (tagsToAdd.has(tag)) {
            return { borderStyle: 'solid', cursor: 'pointer' };
        }
        if (tagsToRemove.has(tag)) {
            return { borderStyle: 'dashed', textDecoration: 'line-through', cursor: 'pointer' };
        }
        return { cursor: 'pointer' };
    };

    return (
        <Modal
            title={
                <Space>
                    <TagsOutlined />
                    <span>批量修改标签</span>
                    <Text type="secondary" style={{ fontWeight: 'normal' }}>
                        (已选 {selectedIds.size} 项)
                    </Text>
                </Space>
            }
            open={open}
            onCancel={handleClose}
            width={600}
            {...modalProps}
            footer={[
                <Button key="reset" onClick={handleReset}>
                    重置
                </Button>,
                <Button key="cancel" onClick={handleClose}>
                    取消
                </Button>,
                <Button
                    key="apply"
                    type="primary"
                    onClick={handleApply}
                    loading={isLoading}
                    disabled={tagsToAdd.size === 0 && tagsToRemove.size === 0}
                >
                    应用更改
                </Button>,
            ]}
        >
            <Flex vertical gap={16} ref={containerRef}>
                {/* Instructions */}
                <Text type="secondary">
                    点击标签切换状态：
                    <Tag color="success" style={{ marginLeft: 8 }}>添加</Tag>
                    <Tag color="error" style={{ textDecoration: 'line-through' }}>移除</Tag>
                    <Tag>不变</Tag>
                </Text>

                {/* Add new tag */}
                <Flex gap={8}>
                    <Input
                        placeholder="输入新标签名称..."
                        value={newTagInput}
                        onChange={(e) => setNewTagInput(e.target.value)}
                        onPressEnter={handleAddNewTag}
                        style={{ flex: 1 }}
                        {...autoFocusFieldProps}
                    />
                    <Button
                        icon={<PlusOutlined />}
                        onClick={handleAddNewTag}
                        disabled={!newTagInput.trim()}
                    >
                        添加新标签
                    </Button>
                </Flex>

                <Divider style={{ margin: '8px 0' }} />

                {/* Available tags */}
                <div>
                    <Text strong style={{ marginBottom: 8, display: 'block' }}>
                        可用标签
                    </Text>
                    {sortedTags.length === 0 ? (
                        <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无标签" />
                    ) : (
                        <Flex wrap="wrap" gap={8}>
                            {sortedTags.map((tag) => (
                                <Tag
                                    key={tag}
                                    color={getTagColor(tag)}
                                    style={getTagStyle(tag)}
                                    onClick={() => {
                                        if (tagsToAdd.has(tag)) {
                                            handleToggleRemove(tag);
                                        } else if (tagsToRemove.has(tag)) {
                                            // Reset to neutral
                                            const nextRemove = new Set(tagsToRemove);
                                            nextRemove.delete(tag);
                                            setTagsToRemove(nextRemove);
                                        } else {
                                            handleToggleAdd(tag);
                                        }
                                    }}
                                >
                                    {tag}
                                </Tag>
                            ))}
                        </Flex>
                    )}
                </div>

                {/* New tags to add */}
                {Array.from(tagsToAdd).filter(t => !availableTags.includes(t)).length > 0 && (
                    <>
                        <Divider style={{ margin: '8px 0' }} />
                        <div>
                            <Text strong style={{ marginBottom: 8, display: 'block' }}>
                                新增标签
                            </Text>
                            <Flex wrap="wrap" gap={8}>
                                {Array.from(tagsToAdd)
                                    .filter(t => !availableTags.includes(t))
                                    .map((tag) => (
                                        <Tag
                                            key={tag}
                                            color="success"
                                            closable
                                            onClose={() => {
                                                const next = new Set(tagsToAdd);
                                                next.delete(tag);
                                                setTagsToAdd(next);
                                            }}
                                        >
                                            {tag}
                                        </Tag>
                                    ))}
                            </Flex>
                        </div>
                    </>
                )}

                {/* Summary */}
                {(tagsToAdd.size > 0 || tagsToRemove.size > 0) && (
                    <>
                        <Divider style={{ margin: '8px 0' }} />
                        <div>
                            <Text strong>变更预览：</Text>
                            <Flex gap={16} style={{ marginTop: 8 }}>
                                {tagsToAdd.size > 0 && (
                                    <Text type="success">
                                        + 添加 {tagsToAdd.size} 个标签
                                    </Text>
                                )}
                                {tagsToRemove.size > 0 && (
                                    <Text type="danger">
                                        - 移除 {tagsToRemove.size} 个标签
                                    </Text>
                                )}
                            </Flex>
                        </div>
                    </>
                )}
            </Flex>
        </Modal>
    );
};
