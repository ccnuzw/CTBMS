import React from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { theme } from 'antd';
import StarterKit from '@tiptap/starter-kit';
import TextAlign from '@tiptap/extension-text-align';
import Image from '@tiptap/extension-image';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import Placeholder from '@tiptap/extension-placeholder';
import { Color } from '@tiptap/extension-color';
import { TextStyle } from '@tiptap/extension-text-style';
import CharacterCount from '@tiptap/extension-character-count';
import { Markdown } from 'tiptap-markdown';
import { marked } from 'marked';
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

function createExtensions(placeholderText: string) {
    return [
        StarterKit.configure({
            heading: { levels: [1, 2, 3, 4] },
        }),
        TextStyle,
        Color,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        Image.configure({ HTMLAttributes: { class: 'tiptap-image' } }),
        Table.configure({
            resizable: true,
            HTMLAttributes: { class: 'tiptap-table' },
        }),
        TableRow,
        TableHeader,
        TableCell,
        CharacterCount.configure({ limit: null }),
        Placeholder.configure({ placeholder: placeholderText }),
        Markdown.configure({
            html: true,
            tightLists: false,
            transformPastedText: true,
            transformCopiedText: true,
        }),
    ];
}

/**
 * 安全地将外部获取的 Markdown 转换回 ProseMirror 可以识别的合法 HTML
 * 以避免 tiptap-markdown 在解析含有各种复杂格式/Thead表格时直接丢弃节点导致变成纯文本的问题
 */
function safeMarkdownToEditorHtml(content: string): string {
    if (!content || content.trim().length === 0) return '';
    let html: string;
    if (content.trim().startsWith('<')) {
        html = content;
    } else {
        // Fix broken markdown tables separated by extra blank lines before parsing
        const sanitizedContent = content.replace(/(\|\s*)\n[\s\n]+(\|)/g, '$1\n$2');
        html = marked.parse(sanitizedContent, { gfm: true, breaks: true }) as string;
    }
    // 表格特殊处理：移除 tiptap 原生 table 不认识的 tbody / thead，这极大可能导致表格被无视
    return html.replace(/<\/?t(head|body|foot)[^>]*>/gi, '');
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
    const lastEmittedValueRef = React.useRef<string>('');

    const extensions = React.useMemo(() => createExtensions(placeholder), [placeholder]);

    const initialContent = React.useMemo(() => {
        return safeMarkdownToEditorHtml(value || '');
    }, []);

    const editor = useEditor(
        {
            extensions,
            content: initialContent,
            immediatelyRender: false,
            shouldRerenderOnTransaction: false,
            editorProps: {
                attributes: { class: 'tiptap tiptap-editor' },
            },
            editable: !readOnly,
            onUpdate: ({ editor: ed }) => {
                setCounts({
                    words: ed.storage.characterCount.words(),
                    characters: ed.storage.characterCount.characters(),
                });
                const md = (ed.storage as any).markdown.getMarkdown();
                lastEmittedValueRef.current = md;
                onChange?.(md);
            },
        },
        [readOnly, extensions],
    );

    React.useEffect(() => {
        if (!editor || value === undefined) return;

        if (value !== lastEmittedValueRef.current) {
            if (value) {
                const safeHtml = safeMarkdownToEditorHtml(value);
                editor.commands.setContent(safeHtml, { emitUpdate: false });
            } else {
                editor.commands.clearContent();
            }
            lastEmittedValueRef.current = value;
        }
    }, [value, editor]);

    // 显示最初的计数
    React.useEffect(() => {
        if (editor) {
            setCounts({
                words: editor.storage.characterCount.words(),
                characters: editor.storage.characterCount.characters(),
            });
        }
    }, [editor]);

    if (!editor) return null;

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

    const EditorFooter = () => (
        <div
            className="tiptap-footer"
            style={{
                borderTop: `1px solid ${token.colorBorderSecondary}`,
                color: token.colorTextSecondary,
                background: token.colorBgContainer,
            }}
        >
            {counts.characters} 字符 | {counts.words} 词
        </div>
    );

    if (isMobile) {
        return (
            <div className="tiptap-editor-wrapper tiptap-mobile" style={{ ...wrapperStyle, borderRadius: 12 }}>
                <EditorContent editor={editor} className="tiptap-editor-content tiptap-mobile-content" />
                <EditorFooter />
                <MobileToolbar editor={editor} />
            </div>
        );
    }

    return (
        <div className="tiptap-editor-wrapper" style={wrapperStyle}>
            {!readOnly && <Toolbar editor={editor} />}
            <EditorContent editor={editor} className="tiptap-editor-content" />
            {!readOnly && <EditorFooter />}
        </div>
    );
};

export default TiptapEditor;
