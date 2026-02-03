import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { theme } from 'antd';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import TextAlign from '@tiptap/extension-text-align';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
// Tiptap table extensions
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import CharacterCount from '@tiptap/extension-character-count';
import { Toolbar } from './Toolbar';
import { MobileToolbar } from './MobileToolbar';
import './styles.css';

export interface TiptapEditorProps {
    value?: string;
    onChange?: (value: string) => void;
    placeholder?: string;
    minHeight?: number;
    isMobile?: boolean;
    readOnly?: boolean;
}

export const TiptapEditor: React.FC<TiptapEditorProps> = ({
    value,
    onChange,
    placeholder = '请输入内容...',
    minHeight = 300,
    isMobile = false,
    readOnly = false,
}) => {
    const { token } = theme.useToken();
    const [counts, setCounts] = React.useState({ words: 0, characters: 0 });

    const extensions = React.useMemo(
        () => [
            StarterKit.configure({
                heading: {
                    levels: [1, 2, 3, 4],
                },
                // Disable potential duplicates that cause warnings
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
            Table.configure({
                resizable: true,
                HTMLAttributes: {
                    class: 'tiptap-table',
                },
            }),
            TableRow,
            TableHeader,
            TableCell,
            CharacterCount.configure({
                limit: null,
            }),
            Placeholder.configure({
                placeholder,
            }),
        ],
        [],
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
            editable: !readOnly,
            onUpdate: ({ editor }) => {
                setCounts({
                    words: editor.storage.characterCount.words(),
                    characters: editor.storage.characterCount.characters(),
                });
                onChange?.(editor.getHTML()); // Safe call
            },
        },
        [readOnly],
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
        if (editor && value !== undefined && value !== editor.getHTML()) {

            editor.commands.setContent(value, { emitUpdate: false });
        }
    }, [value, editor]);

    // Initial counts
    React.useEffect(() => {
        if (editor) {
            setCounts({
                words: editor.storage.characterCount.words(),
                characters: editor.storage.characterCount.characters(),
            });
        }
    }, [editor, value]);

    if (!editor) {
        return null;
    }

    // 容器样式 - 使用 theme token
    const wrapperStyle: React.CSSProperties = {
        minHeight,
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
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



    // Footer component
    const EditorFooter = () => (
        <div
            className="tiptap-footer"
            style={{
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                color: token.colorTextSecondary,
                background: token.colorBgContainer
            }}
        >
            {counts.characters} 字符 | {counts.words} 词
        </div>
    );

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
                <EditorFooter />
                <MobileToolbar editor={editor} />
            </div>
        );
    }

    // 桌面端布局：工具栏在顶部
    return (
        <div className="tiptap-editor-wrapper" style={wrapperStyle}>
            {!readOnly && <Toolbar editor={editor} />}
            <EditorContent editor={editor} className="tiptap-editor-content" />
            {!readOnly && <EditorFooter />}
        </div>
    );
};

export default TiptapEditor;
