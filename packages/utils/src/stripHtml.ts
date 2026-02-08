/**
 * 移除 HTML 标签，仅保留纯文本
 * @param html HTML 字符串
 * @returns 纯文本字符串
 */
export const stripHtml = (html: string): string => {
    if (!html) return '';
    // 服务端渲染或无 DOM 环境
    if (typeof document === 'undefined') {
        return html.replace(/<[^>]*>?/gm, '');
    }
    const tmp = document.createElement('DIV');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
};
