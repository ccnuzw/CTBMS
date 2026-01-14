import { useMemo, useRef } from 'react';
import type { ModalProps } from 'antd';

interface UseModalAutoFocusOptions {
    delay?: number;
    afterOpenChange?: (open: boolean) => void;
}

export const useModalAutoFocus = (options: UseModalAutoFocusOptions = {}) => {
    const { delay = 0, afterOpenChange } = options;
    const focusRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement | null>(null);
    const autoFocusFieldProps = useMemo(() => ({ 'data-auto-focus': true }), []);

    const focusTarget = () => {
        const target = focusRef.current;
        if (target && typeof target.focus === 'function') {
            target.focus();
            return;
        }
        const container = containerRef.current;
        const autoFocusEl = container?.querySelector<HTMLElement>('[data-auto-focus]');
        if (autoFocusEl && typeof autoFocusEl.focus === 'function') {
            autoFocusEl.focus();
        }
    };

    const modalProps = useMemo<Pick<ModalProps, 'afterOpenChange'>>(
        () => ({
            afterOpenChange: (open) => {
                if (open) {
                    setTimeout(() => {
                        focusTarget();
                    }, delay);
                }
                afterOpenChange?.(open);
            },
        }),
        [afterOpenChange, delay],
    );

    return { focusRef, containerRef, autoFocusFieldProps, modalProps };
};
