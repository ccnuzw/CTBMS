import React, { useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { Button, Tooltip, Divider, Select, ColorPicker, Flex, theme, Dropdown } from 'antd';
import {
    BoldOutlined,
    ItalicOutlined,
    UnderlineOutlined,
    StrikethroughOutlined,
    OrderedListOutlined,
    UnorderedListOutlined,
    AlignLeftOutlined,
    AlignCenterOutlined,
    AlignRightOutlined,
    LinkOutlined,
    PictureOutlined,
    UndoOutlined,
    RedoOutlined,
    CodeOutlined,
    LineOutlined,
    MinusOutlined,
    TableOutlined,
} from '@ant-design/icons';

interface ToolbarProps {
    editor: Editor;
}

export const Toolbar: React.FC<ToolbarProps> = ({ editor }) => {
    const { token } = theme.useToken();

    const setLink = useCallback(() => {
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('输入链接地址', previousUrl);

        if (url === null) {
            return;
        }

        if (url === '') {
            editor.chain().focus().extendMarkRange('link').unsetLink().run();
            return;
        }

        editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run();
    }, [editor]);

    const addImage = useCallback(() => {
        const url = window.prompt('输入图片地址');

        if (url) {
            editor.chain().focus().setImage({ src: url }).run();
        }
    }, [editor]);

    const handleColorChange = useCallback(
        (color: any) => {
            const hex = typeof color === 'string' ? color : color.toHexString();
            editor.chain().focus().setColor(hex).run();
        },
        [editor],
    );

    const headingOptions = [
        { value: 'paragraph', label: '正文' },
        { value: '1', label: '标题 1' },
        { value: '2', label: '标题 2' },
        { value: '3', label: '标题 3' },
        { value: '4', label: '标题 4' },
    ];

    const getCurrentHeading = () => {
        if (editor.isActive('heading', { level: 1 })) return '1';
        if (editor.isActive('heading', { level: 2 })) return '2';
        if (editor.isActive('heading', { level: 3 })) return '3';
        if (editor.isActive('heading', { level: 4 })) return '4';
        return 'paragraph';
    };

    const handleHeadingChange = (value: string) => {
        if (value === 'paragraph') {
            editor.chain().focus().setParagraph().run();
        } else {
            editor.chain().focus().toggleHeading({ level: parseInt(value) as 1 | 2 | 3 | 4 }).run();
        }
    };

    return (
        <div
            className="tiptap-toolbar"
            style={{
                padding: '8px 12px',
                borderBottom: `1px solid ${token.colorBorderSecondary}`,
                background: token.colorBgLayout,
            }}
        >
            <Flex wrap="wrap" gap={4} align="center">
                {/* 标题选择 */}
                <Select
                    size="small"
                    value={getCurrentHeading()}
                    onChange={handleHeadingChange}
                    options={headingOptions}
                    style={{ width: 100 }}
                    popupMatchSelectWidth={false}
                />

                <Divider type="vertical" style={{ margin: '0 4px' }} />

                {/* 文本格式 */}
                <Tooltip title="加粗 (Ctrl+B)">
                    <Button
                        size="small"
                        type={editor.isActive('bold') ? 'primary' : 'text'}
                        icon={<BoldOutlined />}
                        onClick={() => editor.chain().focus().toggleBold().run()}
                    />
                </Tooltip>

                <Tooltip title="斜体 (Ctrl+I)">
                    <Button
                        size="small"
                        type={editor.isActive('italic') ? 'primary' : 'text'}
                        icon={<ItalicOutlined />}
                        onClick={() => editor.chain().focus().toggleItalic().run()}
                    />
                </Tooltip>

                <Tooltip title="下划线 (Ctrl+U)">
                    <Button
                        size="small"
                        type={editor.isActive('underline') ? 'primary' : 'text'}
                        icon={<UnderlineOutlined />}
                        onClick={() => editor.chain().focus().toggleUnderline().run()}
                    />
                </Tooltip>

                <Tooltip title="删除线">
                    <Button
                        size="small"
                        type={editor.isActive('strike') ? 'primary' : 'text'}
                        icon={<StrikethroughOutlined />}
                        onClick={() => editor.chain().focus().toggleStrike().run()}
                    />
                </Tooltip>

                <Tooltip title="代码">
                    <Button
                        size="small"
                        type={editor.isActive('code') ? 'primary' : 'text'}
                        icon={<CodeOutlined />}
                        onClick={() => editor.chain().focus().toggleCode().run()}
                    />
                </Tooltip>

                {/* 颜色选择 */}
                <ColorPicker
                    size="small"
                    value={editor.getAttributes('textStyle').color || '#000000'}
                    onChange={handleColorChange}
                />

                <Divider type="vertical" style={{ margin: '0 4px' }} />

                {/* 列表 */}
                <Tooltip title="无序列表">
                    <Button
                        size="small"
                        type={editor.isActive('bulletList') ? 'primary' : 'text'}
                        icon={<UnorderedListOutlined />}
                        onClick={() => editor.chain().focus().toggleBulletList().run()}
                    />
                </Tooltip>

                <Tooltip title="有序列表">
                    <Button
                        size="small"
                        type={editor.isActive('orderedList') ? 'primary' : 'text'}
                        icon={<OrderedListOutlined />}
                        onClick={() => editor.chain().focus().toggleOrderedList().run()}
                    />
                </Tooltip>

                <Divider type="vertical" style={{ margin: '0 4px' }} />

                {/* 对齐方式 */}
                <Tooltip title="左对齐">
                    <Button
                        size="small"
                        type={editor.isActive({ textAlign: 'left' }) ? 'primary' : 'text'}
                        icon={<AlignLeftOutlined />}
                        onClick={() => editor.chain().focus().setTextAlign('left').run()}
                    />
                </Tooltip>

                <Tooltip title="居中对齐">
                    <Button
                        size="small"
                        type={editor.isActive({ textAlign: 'center' }) ? 'primary' : 'text'}
                        icon={<AlignCenterOutlined />}
                        onClick={() => editor.chain().focus().setTextAlign('center').run()}
                    />
                </Tooltip>

                <Tooltip title="右对齐">
                    <Button
                        size="small"
                        type={editor.isActive({ textAlign: 'right' }) ? 'primary' : 'text'}
                        icon={<AlignRightOutlined />}
                        onClick={() => editor.chain().focus().setTextAlign('right').run()}
                    />
                </Tooltip>

                <Divider type="vertical" style={{ margin: '0 4px' }} />

                {/* 插入 */}
                <Tooltip title="插入链接">
                    <Button
                        size="small"
                        type={editor.isActive('link') ? 'primary' : 'text'}
                        icon={<LinkOutlined />}
                        onClick={setLink}
                    />
                </Tooltip>

                <Tooltip title="插入图片">
                    <Button size="small" type="text" icon={<PictureOutlined />} onClick={addImage} />
                </Tooltip>

                <Tooltip title="表格">
                    <Dropdown
                        menu={{
                            items: [
                                {
                                    key: 'insert-table',
                                    label: '插入表格',
                                    onClick: () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run(),
                                },
                                {
                                    type: 'divider',
                                },
                                {
                                    key: 'add-column-before',
                                    label: '左侧插入列',
                                    onClick: () => editor.chain().focus().addColumnBefore().run(),
                                    disabled: !editor.can().addColumnBefore(),
                                },
                                {
                                    key: 'add-column-after',
                                    label: '右侧插入列',
                                    onClick: () => editor.chain().focus().addColumnAfter().run(),
                                    disabled: !editor.can().addColumnAfter(),
                                },
                                {
                                    key: 'delete-column',
                                    label: '删除列',
                                    danger: true,
                                    onClick: () => editor.chain().focus().deleteColumn().run(),
                                    disabled: !editor.can().deleteColumn(),
                                },
                                {
                                    type: 'divider',
                                },
                                {
                                    key: 'add-row-before',
                                    label: '上方插入行',
                                    onClick: () => editor.chain().focus().addRowBefore().run(),
                                    disabled: !editor.can().addRowBefore(),
                                },
                                {
                                    key: 'add-row-after',
                                    label: '下方插入行',
                                    onClick: () => editor.chain().focus().addRowAfter().run(),
                                    disabled: !editor.can().addRowAfter(),
                                },
                                {
                                    key: 'delete-row',
                                    label: '删除行',
                                    danger: true,
                                    onClick: () => editor.chain().focus().deleteRow().run(),
                                    disabled: !editor.can().deleteRow(),
                                },
                                {
                                    type: 'divider',
                                },
                                {
                                    key: 'merge-cells',
                                    label: '合并单元格',
                                    onClick: () => editor.chain().focus().mergeCells().run(),
                                    disabled: !editor.can().mergeCells(),
                                },
                                {
                                    key: 'split-cell',
                                    label: '拆分单元格',
                                    onClick: () => editor.chain().focus().splitCell().run(),
                                    disabled: !editor.can().splitCell(),
                                },
                                {
                                    type: 'divider',
                                },
                                {
                                    key: 'delete-table',
                                    label: '删除表格',
                                    danger: true,
                                    onClick: () => editor.chain().focus().deleteTable().run(),
                                    disabled: !editor.can().deleteTable(),
                                },
                            ],
                        }}
                    >
                        <Button
                            size="small"
                            type={editor.isActive('table') ? 'primary' : 'text'}
                            icon={<TableOutlined />}
                        />
                    </Dropdown>
                </Tooltip>

                <Tooltip title="分隔线">
                    <Button
                        size="small"
                        type="text"
                        icon={<MinusOutlined />}
                        onClick={() => editor.chain().focus().setHorizontalRule().run()}
                    />
                </Tooltip>

                <Divider type="vertical" style={{ margin: '0 4px' }} />

                {/* 撤销/重做 */}
                <Tooltip title="撤销 (Ctrl+Z)">
                    <Button
                        size="small"
                        type="text"
                        icon={<UndoOutlined />}
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                    />
                </Tooltip>

                <Tooltip title="重做 (Ctrl+Shift+Z)">
                    <Button
                        size="small"
                        type="text"
                        icon={<RedoOutlined />}
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                    />
                </Tooltip>
            </Flex>
        </div>
    );
};
