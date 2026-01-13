import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { theme } from 'antd';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import Placeholder from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import { Toolbar } from './Toolbar';
import { MobileToolbar } from './MobileToolbar';
import './styles.css';

export interface TiptapEditorProps {
    value: string;
    onChange: (value: string) => void;
    placeholder?: string;
    minHeight?: number;
    isMobile?: boolean;
}

export const TiptapEditor: React.FC<TiptapEditorProps> = ({
    value,
    onChange,
    placeholder = '请输入内容...',
    minHeight = 300,
    isMobile = false,
}) => {
    const { token } = theme.useToken();

    // 使用 useMemo 缓存 extensions 避免重复创建
    const extensions = React.useMemo(
        () => [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3, 4],
                },
                // Disable potential duplicates that cause warnings
                // @ts-ignore
                link: false,
                // @ts-ignore
                underline: false,
            }),
            Underline,
            TextStyle,
            Color,
            TextAlign.configure({
                types: ['heading', 'paragraph'],
            }),
            Link.configure({
                openOnClick: false,
                HTMLAttributes: {
                    class: 'tiptap-link',
                },
            }),
            Image.configure({
                HTMLAttributes: {
                    class: 'tiptap-image',
                },
            }),
            Placeholder.configure({
                placeholder,
            }),
        ],
        [], // 移除 placeholder 依赖,避免重新创建
    );

    const editor = useEditor(
        {
            extensions,
            content: value,
            immediatelyRender: false,
            shouldRerenderOnTransaction: false,
            editorProps: {
                attributes: {
                    class: 'tiptap-editor',
                },
            },
            onUpdate: ({ editor }) => {
                onChange(editor.getHTML());
            },
        },
        [], // 空依赖数组,确保只创建一次
    );

    // 更新 placeholder (如果需要)
    React.useEffect(() => {
        if (editor && placeholder) {
            editor.extensionManager.extensions.forEach((ext) => {
                if (ext.name === 'placeholder') {
                    ext.options.placeholder = placeholder;
                }
            });
        }
    }, [editor, placeholder]);

    // Sync external value changes
    React.useEffect(() => {
        if (editor && value !== editor.getHTML()) {
            editor.commands.setContent(value, { emitUpdate: false });
        }
    }, [value, editor]);

    if (!editor) {
        return null;
    }

    // 容器样式 - 使用 theme token
    const wrapperStyle: React.CSSProperties = {
        minHeight,
        border: `1px solid ${token.colorBorder}`,
        borderRadius: token.borderRadius,
        background: token.colorBgContainer,
        overflow: 'hidden',
        transition: 'border-color 0.3s',
    };

    const wrapperFocusStyle: React.CSSProperties = {
        ...wrapperStyle,
        borderColor: token.colorPrimary,
        boxShadow: `0 0 0 2px ${token.colorPrimaryBg}`,
    };

    // 移动端布局：工具栏在底部
    if (isMobile) {
        return (
            <div
                className="tiptap-editor-wrapper tiptap-mobile"
                style={{
                    ...wrapperStyle,
                    display: 'flex',
                    flexDirection: 'column',
                    borderRadius: isMobile ? 12 : token.borderRadius,
                }}
            >
                <EditorContent editor={editor} className="tiptap-editor-content tiptap-mobile-content" />
                <MobileToolbar editor={editor} />
            </div>
        );
    }

    // 桌面端布局：工具栏在顶部
    return (
        <div className="tiptap-editor-wrapper" style={wrapperStyle}>
            <Toolbar editor={editor} />
            <EditorContent editor={editor} className="tiptap-editor-content" />
        </div>
    );
};

export default TiptapEditor;


