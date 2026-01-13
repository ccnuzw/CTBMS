import React, { useCallback, useState } from 'react';
import { Editor } from '@tiptap/react';
import { Button, Dropdown, Flex, Segmented, theme } from 'antd';
import type { MenuProps } from 'antd';
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
    FontSizeOutlined,
    MoreOutlined,
    CheckOutlined,
} from '@ant-design/icons';

interface MobileToolbarProps {
    editor: Editor;
}

export const MobileToolbar: React.FC<MobileToolbarProps> = ({ editor }) => {
    const { token } = theme.useToken();
    const [activeTab, setActiveTab] = useState<string>('format');

    const setLink = useCallback(() => {
        const previousUrl = editor.getAttributes('link').href;
        const url = window.prompt('输入链接地址', previousUrl);

        if (url === null) return;

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

    // 标题下拉菜单
    const headingItems: MenuProps['items'] = [
        {
            key: 'p',
            label: '正文',
            icon: editor.isActive('paragraph') ? <CheckOutlined /> : null,
            onClick: () => editor.chain().focus().setParagraph().run(),
        },
        {
            key: 'h1',
            label: '标题 1',
            icon: editor.isActive('heading', { level: 1 }) ? <CheckOutlined /> : null,
            onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
        },
        {
            key: 'h2',
            label: '标题 2',
            icon: editor.isActive('heading', { level: 2 }) ? <CheckOutlined /> : null,
            onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
        },
        {
            key: 'h3',
            label: '标题 3',
            icon: editor.isActive('heading', { level: 3 }) ? <CheckOutlined /> : null,
            onClick: () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
        },
    ];

    // 更多操作下拉菜单
    const moreItems: MenuProps['items'] = [
        {
            key: 'link',
            label: '插入链接',
            icon: <LinkOutlined />,
            onClick: setLink,
        },
        {
            key: 'image',
            label: '插入图片',
            icon: <PictureOutlined />,
            onClick: addImage,
        },
        { type: 'divider' },
        {
            key: 'hr',
            label: '分隔线',
            onClick: () => editor.chain().focus().setHorizontalRule().run(),
        },
        {
            key: 'code',
            label: '代码',
            onClick: () => editor.chain().focus().toggleCode().run(),
        },
    ];

    // 工具按钮样式
    const toolBtnStyle = (isActive: boolean) => ({
        minWidth: 44,
        minHeight: 44,
        borderRadius: token.borderRadius,
        background: isActive ? token.colorPrimaryBg : 'transparent',
        color: isActive ? token.colorPrimary : token.colorText,
        border: 'none',
        padding: 0,
    });

    // 格式化工具栏
    const FormatTools = () => (
        <Flex gap={4} wrap="wrap" justify="center">
            <Button
                type="text"
                icon={<BoldOutlined style={{ fontSize: 18 }} />}
                style={toolBtnStyle(editor.isActive('bold'))}
                onClick={() => editor.chain().focus().toggleBold().run()}
            />
            <Button
                type="text"
                icon={<ItalicOutlined style={{ fontSize: 18 }} />}
                style={toolBtnStyle(editor.isActive('italic'))}
                onClick={() => editor.chain().focus().toggleItalic().run()}
            />
            <Button
                type="text"
                icon={<UnderlineOutlined style={{ fontSize: 18 }} />}
                style={toolBtnStyle(editor.isActive('underline'))}
                onClick={() => editor.chain().focus().toggleUnderline().run()}
            />
            <Button
                type="text"
                icon={<StrikethroughOutlined style={{ fontSize: 18 }} />}
                style={toolBtnStyle(editor.isActive('strike'))}
                onClick={() => editor.chain().focus().toggleStrike().run()}
            />
            <Dropdown menu={{ items: headingItems }} trigger={['click']}>
                <Button
                    type="text"
                    icon={<FontSizeOutlined style={{ fontSize: 18 }} />}
                    style={toolBtnStyle(editor.isActive('heading'))}
                />
            </Dropdown>
        </Flex>
    );

    // 列表与对齐工具栏
    const ListTools = () => (
        <Flex gap={4} wrap="wrap" justify="center">
            <Button
                type="text"
                icon={<UnorderedListOutlined style={{ fontSize: 18 }} />}
                style={toolBtnStyle(editor.isActive('bulletList'))}
                onClick={() => editor.chain().focus().toggleBulletList().run()}
            />
            <Button
                type="text"
                icon={<OrderedListOutlined style={{ fontSize: 18 }} />}
                style={toolBtnStyle(editor.isActive('orderedList'))}
                onClick={() => editor.chain().focus().toggleOrderedList().run()}
            />
            <div
                style={{
                    width: 1,
                    height: 24,
                    background: token.colorBorderSecondary,
                    margin: '0 8px',
                    alignSelf: 'center',
                }}
            />
            <Button
                type="text"
                icon={<AlignLeftOutlined style={{ fontSize: 18 }} />}
                style={toolBtnStyle(editor.isActive({ textAlign: 'left' }))}
                onClick={() => editor.chain().focus().setTextAlign('left').run()}
            />
            <Button
                type="text"
                icon={<AlignCenterOutlined style={{ fontSize: 18 }} />}
                style={toolBtnStyle(editor.isActive({ textAlign: 'center' }))}
                onClick={() => editor.chain().focus().setTextAlign('center').run()}
            />
            <Button
                type="text"
                icon={<AlignRightOutlined style={{ fontSize: 18 }} />}
                style={toolBtnStyle(editor.isActive({ textAlign: 'right' }))}
                onClick={() => editor.chain().focus().setTextAlign('right').run()}
            />
        </Flex>
    );

    return (
        <div className="tiptap-mobile-toolbar">
            {/* 主工具栏区 */}
            <div style={{ padding: '8px 4px', background: token.colorBgContainer }}>
                {activeTab === 'format' && <FormatTools />}
                {activeTab === 'list' && <ListTools />}
            </div>

            {/* 底部切换栏 */}
            <Flex
                justify="space-between"
                align="center"
                style={{
                    padding: '6px 8px',
                    borderTop: `1px solid ${token.colorBorderSecondary}`,
                    background: token.colorBgLayout,
                }}
            >
                <Segmented
                    size="small"
                    value={activeTab}
                    onChange={(v) => setActiveTab(v as string)}
                    options={[
                        { label: '格式', value: 'format' },
                        { label: '段落', value: 'list' },
                    ]}
                />

                <Flex gap={4}>
                    <Button
                        type="text"
                        size="small"
                        icon={<UndoOutlined />}
                        onClick={() => editor.chain().focus().undo().run()}
                        disabled={!editor.can().undo()}
                        style={{ minWidth: 36, minHeight: 36 }}
                    />
                    <Button
                        type="text"
                        size="small"
                        icon={<RedoOutlined />}
                        onClick={() => editor.chain().focus().redo().run()}
                        disabled={!editor.can().redo()}
                        style={{ minWidth: 36, minHeight: 36 }}
                    />
                    <Dropdown menu={{ items: moreItems }} trigger={['click']} placement="topRight">
                        <Button
                            type="text"
                            size="small"
                            icon={<MoreOutlined />}
                            style={{ minWidth: 36, minHeight: 36 }}
                        />
                    </Dropdown>
                </Flex>
            </Flex>
        </div>
    );
};
