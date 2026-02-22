import React from 'react';
import { theme } from 'antd';

export const stripHtml = (html: string) => {
    if (!html) return '';
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
};

/**
 * 高亮关键词：将文本中的关键词用 <mark> 标签包裹
 * @param text 原始文本
 * @param keywords 关键词（空格分隔的字符串）
 * @returns React 元素数组
 */
export const highlightKeywords = (text: string, keywords: string, colorWarningBg: string): React.ReactNode => {
    if (!text || !keywords?.trim()) return text;

    // 将关键词拆分并创建正则表达式
    const keywordList = keywords.trim().split(/\s+/).filter(Boolean);
    if (keywordList.length === 0) return text;

    // 转义特殊正则字符
    const escaped = keywordList.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const regex = new RegExp(`(${escaped.join('|')})`, 'gi');

    // 分割文本并高亮匹配部分
    const parts = text.split(regex);
    return parts.map((part, i) => {
        const isMatch = keywordList.some((k) => k.toLowerCase() === part.toLowerCase());
        return isMatch ? (
            <mark
                key={i}
                style={{
                    backgroundColor: colorWarningBg,
                    padding: '0 2px',
                    borderRadius: 2,
                }}
            >
                {part}
            </mark>
        ) : (
            part
        );
    });
};
