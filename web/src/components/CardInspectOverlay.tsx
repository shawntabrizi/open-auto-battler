import { useEffect, useRef } from 'react';
import { CardDetailPanel, type CardDetailPanelMode } from './CardDetailPanel';
import { useCardInspectStore } from '../store/cardInspectStore';

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

interface CardInspectOverlayProps {
  mode: CardDetailPanelMode;
}

export function CardInspectOverlay({ mode }: CardInspectOverlayProps) {
  const isOpen = useCardInspectStore((state) => state.isOpen);
  const card = useCardInspectStore((state) => state.card);
  const close = useCardInspectStore((state) => state.close);
  const panelRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen && !card) {
      close();
    }
  }, [card, close, isOpen]);

  useEffect(() => {
    if (!isOpen || !card) return;

    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusInitialElement = () => {
      const panel = panelRef.current;
      if (!panel) return;

      const preferredFocus = panel.querySelector<HTMLElement>(
        '[data-card-detail-scroll-region="true"]'
      );
      if (preferredFocus) {
        preferredFocus.focus();
        return;
      }

      const focusable = getFocusableElements(panel);
      (focusable[0] ?? panel).focus();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close();
        return;
      }

      if (e.key !== 'Tab') return;

      const panel = panelRef.current;
      if (!panel) return;

      const focusable = getFocusableElements(panel);
      if (focusable.length === 0) {
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;

      const activeElement =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;

      if (!activeElement || !panel.contains(activeElement)) {
        e.preventDefault();
        (e.shiftKey ? last : first).focus();
        return;
      }

      if (!e.shiftKey && activeElement === last) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    };

    const onFocusIn = (e: FocusEvent) => {
      const panel = panelRef.current;
      if (!panel) return;
      if (e.target instanceof Node && panel.contains(e.target)) return;

      const focusable = getFocusableElements(panel);
      (focusable[0] ?? panel).focus();
    };

    const frameId = window.requestAnimationFrame(focusInitialElement);
    window.addEventListener('keydown', onKey);
    document.addEventListener('focusin', onFocusIn);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('focusin', onFocusIn);
      previousFocusRef.current?.focus();
    };
  }, [card, close, isOpen]);

  if (!isOpen || !card) return null;

  return (
    <div className="fixed inset-0 z-[9996]">
      <div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm animate-fade-in"
        onClick={close}
      />
      <div className="absolute inset-0 flex items-center justify-center p-0 sm:p-4 lg:p-8">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label={`Inspect ${card.name}`}
          tabIndex={-1}
          className="flex h-full w-full justify-center sm:max-h-[90vh] sm:max-w-6xl"
        >
          <CardDetailPanel
            card={card}
            isVisible={true}
            mode={mode}
            layout="contained"
            onClose={close}
          />
        </div>
      </div>
    </div>
  );
}
