// ─── useTypingEffect Hook ────────────────────────────────────────────────────
// 打字机效果 Hook：对新内容逐字显示，切换会话时避免重复播放
// 提取自 CopilotChatView.tsx

import { useEffect, useRef, useState } from 'react';

export const useTypingEffect = (
    text: string,
    isActive: boolean,
    speed = 25,
): { displayText: string; isTyping: boolean } => {
    const [displayText, setDisplayText] = useState('');
    const [isTyping, setIsTyping] = useState(false);
    const prevTextRef = useRef('');

    useEffect(() => {
        if (!isActive || !text) {
            setDisplayText(text);
            setIsTyping(false);
            return;
        }
        // 只对新内容启动打字机（避免切换会话时重复播放）
        if (text === prevTextRef.current) {
            setDisplayText(text);
            return;
        }
        prevTextRef.current = text;
        setIsTyping(true);
        setDisplayText('');
        let idx = 0;
        const timer = setInterval(() => {
            idx += 1;
            if (idx >= text.length) {
                setDisplayText(text);
                setIsTyping(false);
                clearInterval(timer);
            } else {
                setDisplayText(text.slice(0, idx));
            }
        }, speed);
        return () => clearInterval(timer);
    }, [text, isActive, speed]);

    return { displayText, isTyping };
};
