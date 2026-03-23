import { useEffect, useRef } from 'react';
import { CardDetailPanel } from './CardDetailPanel';
import { UI_LAYERS } from '../constants/uiLayers';
import { useFocusTrap } from '../hooks';
import { useCardInspectStore } from '../store/cardInspectStore';

export function CardInspectOverlay() {
  const isOpen = useCardInspectStore((state) => state.isOpen);
  const card = useCardInspectStore((state) => state.card);
  const close = useCardInspectStore((state) => state.close);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen && !card) {
      close();
    }
  }, [card, close, isOpen]);

  useFocusTrap({
    containerRef: panelRef,
    initialFocusSelector: '[data-card-detail-scroll-region="true"]',
    isActive: isOpen && !!card,
    onEscape: close,
  });

  if (!isOpen || !card) return null;

  return (
    <div className="fixed inset-0" style={{ zIndex: UI_LAYERS.cardInspect }}>
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
            layout="contained"
            onClose={close}
          />
        </div>
      </div>
    </div>
  );
}
