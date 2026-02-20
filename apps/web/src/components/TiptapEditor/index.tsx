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
import { generateJSON } from '@tiptap/html';
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

/**
 * Extensions list shared between the editor and generateJSON.
 * Must be the same set so HTML ↔ JSON conversion is schema-compatible.
 */
function createExtensions(placeholderText: string) {
    return [
        StarterKit.configure({
            heading: { levels: [1, 2, 3, 4] },
            link: {
                openOnClick: false,
                HTMLAttributes: { class: 'tiptap-link' },
            },
        }),
        Markdown.configure({
            html: true,
            tightLists: false,
            transformPastedText: true,
            transformCopiedText: true,
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
    ];
}

/**
 * Convert markdown string to ProseMirror JSON using:
 *   1. marked (markdown → HTML with full GFM table/list support)
 *   2. @tiptap/html generateJSON (HTML → ProseMirror JSON)
 *
 * The resulting JSON can be passed to editor.commands.setContent()
 * which bypasses tiptap-markdown's string interception entirely.
 */
function markdownToJson(md: string, extensions: ReturnType<typeof createExtensions>) {
    if (!md) return null;
    // If content is already HTML, use it directly
    const html = md.trim().startsWith('<') ? md : (marked.parse(md, { gfm: true, breaks: true }) as string);
    if (!html || html.trim().length === 0) return null;
    try {
        return generateJSON(html, extensions);
    } catch (e) {
        console.warn('[TiptapEditor] Failed to convert content to JSON:', e);
        return null;
    }
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
    const lastSetValueRef = React.useRef<string>('');

    const extensions = React.useMemo(() => createExtensions(placeholder), []);

    // Convert initial value to JSON (computed once)
    const initialJson = React.useMemo(() => {
        if (!value) return undefined;
        return markdownToJson(value, extensions) || undefined;
    }, []); // Only compute on mount

    const editor = useEditor(
        {
            extensions,
            content: initialJson || '', // Pass JSON directly; bypasses tiptap-markdown
            immediatelyRender: false,
            shouldRerenderOnTransaction: false,
            editorProps: {
                attributes: { class: 'tiptap-editor' },
            },
            editable: !readOnly,
            onUpdate: ({ editor }) => {
                setCounts({
                    words: editor.storage.characterCount.words(),
                    characters: editor.storage.characterCount.characters(),
                });
                // Output as standard Markdown via tiptap-markdown
                const md = (editor.storage as any).markdown.getMarkdown();
                lastSetValueRef.current = md;
                onChange?.(md);
            },
        },
        [readOnly],
    );

    // Update placeholder
    React.useEffect(() => {
        if (editor && placeholder) {
            editor.extensionManager.extensions.forEach((ext) => {
                if (ext.name === 'placeholder') {
                    ext.options.placeholder = placeholder;
                }
            });
        }
    }, [editor, placeholder]);

    // Sync external value changes (e.g. when PDF content is loaded after upload)
    // Converts markdown → HTML → JSON → setContent(json) to bypass tiptap-markdown
    React.useEffect(() => {
        if (!editor || value === undefined) return;
        if (value === lastSetValueRef.current) return;

        const json = markdownToJson(value, extensions);
        if (json) {
            editor.commands.setContent(json, { emitUpdate: false }); // JSON bypasses tiptap-markdown
        } else if (value === '') {
            editor.commands.clearContent();
        }
        lastSetValueRef.current = value;
    }, [value, editor, extensions]);

    // Initial counts
    React.useEffect(() => {
        if (editor) {
            setCounts({
                words: editor.storage.characterCount.words(),
                characters: editor.storage.characterCount.characters(),
            });
        }
    }, [editor, value]);

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
