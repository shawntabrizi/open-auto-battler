import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement | null) {
  if (!container) return [];

  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.getAttribute('aria-hidden') !== 'true' &&
      element.offsetParent !== null
  );
}

interface UseFocusTrapOptions<T extends HTMLElement> {
  containerRef: RefObject<T | null>;
  isActive: boolean;
  initialFocusSelector?: string;
  onEscape?: () => void;
}

export function useFocusTrap<T extends HTMLElement>({
  containerRef,
  isActive,
  initialFocusSelector,
  onEscape,
}: UseFocusTrapOptions<T>) {
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isActive) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusInitialElement = () => {
      const panel = containerRef.current;
      if (!panel) return;

      if (initialFocusSelector) {
        const preferredFocus = panel.querySelector<HTMLElement>(initialFocusSelector);
        if (preferredFocus) {
          preferredFocus.focus();
          return;
        }
      }

      const focusable = getFocusableElements(panel);
      (focusable[0] ?? panel).focus();
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onEscape) {
        onEscape();
        return;
      }

      if (event.key !== 'Tab') return;

      const panel = containerRef.current;
      if (!panel) return;

      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) {
        event.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (!activeElement || !panel.contains(activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
        return;
      }

      if (!event.shiftKey && activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (event.shiftKey && activeElement === first) {
        event.preventDefault();
        last.focus();
      }
    };

    const onFocusIn = (event: FocusEvent) => {
      const panel = containerRef.current;
      if (!panel) return;
      if (event.target instanceof Node && panel.contains(event.target)) return;

      const focusable = getFocusableElements(panel);
      (focusable[0] ?? panel).focus();
    };

    const frameId = window.requestAnimationFrame(focusInitialElement);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
      previousFocusRef.current?.focus();
    };
  }, [containerRef, initialFocusSelector, isActive, onEscape]);
}
