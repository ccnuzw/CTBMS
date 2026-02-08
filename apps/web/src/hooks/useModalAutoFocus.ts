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

    const isHtmlElement = (value: unknown): value is HTMLElement => {
        return !!value && typeof (value as HTMLElement).getAttribute === 'function';
    };

    const resolveFocusableElement = (target: unknown): HTMLElement | null => {
        if (isHtmlElement(target)) {
            return target;
        }
        const maybe = target as {
            input?: unknown;
            nativeElement?: unknown;
            element?: unknown;
            current?: unknown;
        } | null;
        if (!maybe) {
            return null;
        }
        if (isHtmlElement(maybe.input)) {
            return maybe.input;
        }
        if (isHtmlElement(maybe.nativeElement)) {
            return maybe.nativeElement;
        }
        if (isHtmlElement(maybe.element)) {
            return maybe.element;
        }
        if (isHtmlElement(maybe.current)) {
            return maybe.current;
        }
        return null;
    };

    const isFocusableElement = (el: HTMLElement | null | undefined) => {
        if (!el || typeof el.focus !== 'function') {
            return false;
        }
        if (el.hasAttribute('inert') || !!el.closest('[inert]')) {
            return false;
        }
        if (el.getAttribute('aria-hidden') === 'true') {
            return false;
        }
        if (el.closest('[aria-hidden="true"]')) {
            return false;
        }
        const className = typeof el.className === 'string' ? el.className : '';
        if (/focus-guard|sentinel/i.test(className)) {
            return false;
        }
        const computedStyle = window.getComputedStyle(el);
        if (computedStyle.display === 'none' || computedStyle.visibility === 'hidden') {
            return false;
        }
        const tabIndex = el.getAttribute('tabindex');
        if (tabIndex !== null && Number(tabIndex) < 0) {
            return false;
        }
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0 && computedStyle.overflow === 'hidden') {
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

    const isFocusable = (target: unknown) => {
        if (!target) {
            return false;
        }
        const element = resolveFocusableElement(target);
        if (element) {
            return isFocusableElement(element);
        }
        if (typeof (target as { focus?: unknown }).focus !== 'function') {
            return false;
        }
        if ('disabled' in (target as { disabled?: boolean }) && (target as { disabled?: boolean }).disabled) {
            return false;
        }
        return true;
    };

    const focusElement = (target: unknown) => {
        const element = resolveFocusableElement(target);
        if (element) {
            element.focus();
            return;
        }
        if (target && typeof (target as { focus?: unknown }).focus === 'function') {
            (target as { focus: () => void }).focus();
        }
    };

    const findFirstFocusable = (container: HTMLDivElement | null) => {
        if (!container) {
            return null;
        }
        const candidates = container.querySelectorAll<HTMLElement>(
            'input, textarea, select, button, [tabindex], [contenteditable="true"]',
        );
        for (const el of Array.from(candidates)) {
            if (isFocusableElement(el)) {
                return el;
            }
        }
        return null;
    };

    const focusTarget = () => {
        const target = focusRef.current;
        if (isFocusable(target)) {
            focusElement(target);
            return;
        }
        const container = containerRef.current;
        const autoFocusEl = container?.querySelector<HTMLElement>('[data-auto-focus]');
        if (isFocusableElement(autoFocusEl)) {
            autoFocusEl?.focus();
            return;
        }
        const fallbackEl = findFirstFocusable(container);
        if (isFocusableElement(fallbackEl)) {
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
