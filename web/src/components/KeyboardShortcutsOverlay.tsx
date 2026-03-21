import { useRef } from 'react';
import { GAME_SHORTCUT_SECTIONS } from './GameKeyboardShortcuts';
import { useShortcutHelpStore } from '../store/shortcutHelpStore';
import { UI_LAYERS } from '../constants/uiLayers';
import { useFocusTrap } from '../hooks';
import { CloseIcon } from './Icons';

export function KeyboardShortcutsOverlay() {
  const { isOpen, close } = useShortcutHelpStore();
  const panelRef = useRef<HTMLDivElement>(null);

  useFocusTrap({
    containerRef: panelRef,
    initialFocusSelector: '[data-shortcuts-autofocus="true"]',
    isActive: isOpen,
    onEscape: close,
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0" style={{ zIndex: UI_LAYERS.keyboardShortcuts }}>
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in"
        onClick={close}
      />
      <div className="absolute inset-0 flex items-center justify-center p-4 lg:p-8">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-label="Keyboard Shortcuts"
          tabIndex={-1}
          className="w-full max-w-3xl max-h-[90vh] overflow-hidden rounded-2xl border border-base-700/70 bg-base-950/95 shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between border-b border-base-800 px-5 py-4 lg:px-6">
            <div>
              <h2 className="text-lg lg:text-2xl font-heading tracking-wide text-white">
                Keyboard Shortcuts
              </h2>
              <p className="mt-1 text-xs lg:text-sm text-base-400">
                Game-mode controls for faster play.
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              aria-label="Close keyboard shortcuts"
              className="theme-button theme-surface-button rounded-lg border p-2 transition-colors"
            >
              <CloseIcon className="theme-icon-muted w-5 h-5" />
            </button>
          </div>

          <div
            data-shortcuts-autofocus="true"
            tabIndex={0}
            role="region"
            aria-label="Keyboard shortcuts list"
            className="overflow-y-auto px-5 py-5 lg:px-6 lg:py-6 space-y-5 outline-none"
          >
            {GAME_SHORTCUT_SECTIONS.map((section) => (
              <section key={section.title} className="space-y-3">
                <h3 className="text-xs lg:text-sm font-heading uppercase tracking-[0.2em] text-base-400">
                  {section.title}
                </h3>
                <div className="grid gap-2">
                  {section.shortcuts.map((shortcut) => (
                    <div
                      key={`${section.title}-${shortcut.keys}`}
                      className="grid grid-cols-[minmax(110px,160px)_1fr] lg:grid-cols-[180px_1fr] gap-3 items-start rounded-xl border border-base-800/70 bg-base-900/50 px-3 py-3"
                    >
                      <div className="font-mono text-xs lg:text-sm text-accent">
                        {shortcut.keys}
                      </div>
                      <div className="text-xs lg:text-sm text-base-200 leading-relaxed">
                        {shortcut.description}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
