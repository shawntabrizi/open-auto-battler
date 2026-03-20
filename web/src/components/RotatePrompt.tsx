import { useState } from 'react';

export function RotatePrompt() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  return (
    <div className="rotate-prompt hidden" aria-hidden="true">
      <div className="rotate-prompt__banner">
        <span className="rotate-prompt__icon">&#x27F3;</span>
        <span className="rotate-prompt__text">Rotate your device for the best experience</span>
        <button
          onClick={() => setDismissed(true)}
          className="rotate-prompt__close"
          aria-label="Dismiss rotation prompt"
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}
