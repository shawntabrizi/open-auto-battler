import { useState } from 'react';

export function RotatePrompt() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="rotate-prompt hidden" aria-hidden="true">
      <div className="rotate-prompt__card">
        <div className="rotate-prompt__icon">&#x27F3;</div>
        <div className="rotate-prompt__title">Rotate your device</div>
        <div className="rotate-prompt__subtitle">This game plays best in landscape mode.</div>
        <button
          onClick={() => setDismissed(true)}
          className="mt-4 px-6 py-1.5 text-sm font-bold text-warm-400 border border-warm-600 rounded-lg hover:bg-warm-800 transition-colors"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}
