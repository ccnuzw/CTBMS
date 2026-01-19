import React, { useEffect, useRef, useMemo } from 'react';
import { theme } from 'antd';

export interface HighlightRange {
    start: number;
    end: number;
    color?: string;
    id?: string;
    label?: string;
}

interface SourceHighlighterProps {
    content: string;
    highlights: HighlightRange[];
    activeHighlightId?: string | null;
    onHighlightClick?: (highlight: HighlightRange) => void;
    className?: string;
    style?: React.CSSProperties;
}

export const SourceHighlighter: React.FC<SourceHighlighterProps> = ({
    content,
    highlights,
    activeHighlightId,
    onHighlightClick,
    className,
    style,
}) => {
    const { token } = theme.useToken();
    const containerRef = useRef<HTMLDivElement>(null);
    const activeRef = useRef<HTMLElement>(null);

    // 自动滚动到激活的高亮位置
    useEffect(() => {
        if (activeHighlightId && activeRef.current && containerRef.current) {
            activeRef.current.scrollIntoView({
                behavior: 'smooth',
                block: 'center',
            });
        }
    }, [activeHighlightId]);

    // 切割文本段落
    const segments = useMemo(() => {
        if (!content) return [];

        // 按起始位置排序
        const sortedHighlights = [...highlights].sort((a, b) => a.start - b.start);

        const result: React.ReactNode[] = [];
        let lastIndex = 0;

        sortedHighlights.forEach((h, index) => {
            // 添加高亮前的普通文本
            if (h.start > lastIndex) {
                result.push(
                    <span key={`text-${lastIndex}`}>
                        {content.slice(lastIndex, h.start)}
                    </span>
                );
            }

            // 添加高亮文本
            const isActive = activeHighlightId === h.id;
            const highlightColor = h.color || token.colorWarning;

            result.push(
                <mark
                    key={`highlight-${h.id || index}`}
                    ref={isActive ? activeRef : undefined}
                    onClick={() => onHighlightClick?.(h)}
                    style={{
                        backgroundColor: isActive ? highlightColor : `${highlightColor}40`, // 激活时深色，平时浅色
                        color: token.colorText,
                        padding: '2px 0',
                        cursor: onHighlightClick ? 'pointer' : 'default',
                        borderBottom: isActive ? `2px solid ${highlightColor}` : 'none',
                        transition: 'all 0.3s',
                        borderRadius: 2,
                    }}
                    title={h.label}
                >
                    {content.slice(h.start, h.end)}
                </mark>
            );

            lastIndex = h.end;
        });

        // 添加剩余文本
        if (lastIndex < content.length) {
            result.push(
                <span key={`text-${lastIndex}`}>
                    {content.slice(lastIndex)}
                </span>
            );
        }

        return result;
    }, [content, highlights, activeHighlightId, token, onHighlightClick]);

    return (
        <div
            ref={containerRef}
            className={className}
            style={{
                fontFamily: 'Menlo, Monaco, "Courier New", monospace', // 等宽字体更像源码
                lineHeight: 1.8,
                whiteSpace: 'pre-wrap',
                fontSize: 13,
                color: token.colorTextSecondary,
                ...style,
            }}
        >
            {segments}
        </div>
    );
};
