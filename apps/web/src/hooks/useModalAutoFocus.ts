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
    const autoFocusFieldProps = useMemo(() => ({ 'data-auto-focus': 'true' }), []);

    const isFocusable = (el: HTMLElement | null | undefined) => {
        if (!el || typeof el.focus !== 'function') {
            return false;
        }
        if (el.getAttribute('aria-hidden') === 'true') {
            return false;
        }
        const tabIndex = el.getAttribute('tabindex');
        if (tabIndex !== null && Number(tabIndex) < 0) {
            return false;
        }
        if (el instanceof HTMLInputElement) {
            if (el.type === 'hidden' || el.disabled) {
                return false;
            }
        }
        if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement || el instanceof HTMLButtonElement) {
            if (el.disabled) {
                return false;
            }
        }
        if (el.hasAttribute('disabled')) {
            return false;
        }
        return true;
    };

    const findFirstFocusable = (container: HTMLDivElement | null) => {
        if (!container) {
            return null;
        }
        const candidates = container.querySelectorAll<HTMLElement>(
            'input, textarea, select, button, [tabindex], [contenteditable="true"]',
        );
        for (const el of Array.from(candidates)) {
            if (isFocusable(el)) {
                return el;
            }
        }
        return null;
    };

    const focusTarget = () => {
        const target = focusRef.current;
        if (isFocusable(target)) {
            target.focus();
            return;
        }
        const container = containerRef.current;
        const autoFocusEl = container?.querySelector<HTMLElement>('[data-auto-focus]');
        if (isFocusable(autoFocusEl)) {
            autoFocusEl?.focus();
            return;
        }
        const fallbackEl = findFirstFocusable(container);
        if (isFocusable(fallbackEl)) {
            fallbackEl?.focus();
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
