import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import { theme } from 'antd';
import styles from './Style.module.css';
import 'highlight.js/styles/github.css'; // Light mode highlight
// We might need dark mode highlight based on theme, but let's start with basic

export interface MarkdownRendererProps {
    content: string;
    className?: string;
}

export const MarkdownRenderer: React.FC<MarkdownRendererProps> = ({ content, className }) => {
    const { token } = theme.useToken();

    // Inject CSS variables based on Ant Design tokens
    const style = {
        '--color-text': token.colorText,
        '--color-text-secondary': token.colorTextSecondary,
        '--color-text-heading': token.colorTextHeading,
        '--color-bg-container': token.colorBgContainer,
        '--color-bg-layout': token.colorBgLayout,
        '--color-border': token.colorBorder,
        '--color-border-secondary': token.colorBorderSecondary,
        '--color-primary': token.colorPrimary,
        '--color-link': token.colorLink,
        // whiteSpace: 'pre-wrap', // Removed to allow markdown parser to handle spacing
    } as React.CSSProperties;

    // Ensure content is a string and normalize weird characters (NBSP, etc) that break Markdown parsing
    // Additionally, fix broken markdown tables separated by extra blank lines
    const safeContent = typeof content === 'string'
        ? content
            .replace(/[\u00A0\u2000-\u200B\u3000]/g, ' ')
            .replace(/(\|\s*)\n[\s\n]+(\|)/g, '$1\n$2')
        : String(content || '');

    return (
        <div className={`${styles.markdownContainer} ${className || ''}`} style={style}>
            <ReactMarkdown
                remarkPlugins={[remarkGfm, remarkBreaks]}
                rehypePlugins={[rehypeRaw, rehypeHighlight]}
                components={{
                    // Ensure links open in new tab
                    a: ({ node, ...props }) => <a target="_blank" rel="noopener noreferrer" {...props} />,
                }}
            >
                {safeContent}
            </ReactMarkdown>
        </div>
    );
};
