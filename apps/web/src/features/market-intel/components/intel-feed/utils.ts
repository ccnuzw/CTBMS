/**
 * 去除 HTML 标签，仅保留纯文本
 * 用于在摘要或列表中展示富文本内容
 */
export const stripHtml = (html?: string | null) => {
    if (!html) return '';
    if (typeof html !== 'string') return String(html);

    // 1. 处理常见块级元素换行，避免文字粘连
    let text = html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/p>/gi, '\n\n')
        .replace(/<\/div>/gi, '\n')
        .replace(/<\/li>/gi, '\n');

    // 2. 去除所有 HTML 标签
    text = text.replace(/<[^>]+>/g, '');

    // 3. 处理连续换行和首尾空格
    return text.replace(/\n\s*\n/g, '\n\n').trim();
};
