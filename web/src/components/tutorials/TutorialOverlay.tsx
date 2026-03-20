import { useEffect } from 'react';
import { useTutorialStore } from '../../store/tutorialStore';
import { useGameStore } from '../../store/gameStore';
import { getTutorial } from './registry';
import { CloseIcon } from '../Icons';

export function TutorialOverlay() {
  const { isOpen, tutorialId, slideIndex, close, next, prev } = useTutorialStore();
  const { initEngine, engine, setMetas, loadSetPreviews } = useGameStore();

  // Ensure engine + card previews are loaded for tutorial slides that display cards
  useEffect(() => {
    if (!isOpen) return;
    if (!engine) {
      void initEngine();
    }
  }, [isOpen, engine, initEngine]);

  useEffect(() => {
    if (!isOpen) return;
    if (engine && setMetas.length > 0) {
      loadSetPreviews();
    }
  }, [isOpen, engine, setMetas, loadSetPreviews]);

  const tutorial = tutorialId ? getTutorial(tutorialId) : undefined;
  const total = tutorial?.slides.length ?? 0;
  const index = Math.max(0, Math.min(slideIndex, total - 1));
  const SlideComponent = tutorial?.slides[index];
  const isLast = index + 1 >= total;

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        if (isLast) close();
        else next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, isLast, close, next, prev]);

  if (!isOpen || !tutorial || !SlideComponent) return null;

  return (
    <div className="fixed inset-0 z-[9998] flex flex-col bg-black/80 backdrop-blur-sm animate-fade-in">
      {/* Close button — floats above content */}
      <button
        onClick={close}
        className="absolute top-3 right-3 z-[1] p-2 rounded-lg bg-warm-900/80 border border-warm-700/60 text-warm-400 hover:text-white hover:border-warm-500 transition-colors"
        aria-label="Close tutorial"
      >
        <CloseIcon className="w-5 h-5" />
      </button>

      {/* Slide content */}
      <div className="flex-1 overflow-y-auto flex items-center justify-center px-6 lg:px-12">
        <div className="w-full max-w-2xl">
          <SlideComponent />
        </div>
      </div>

      {/* Navigation bar */}
      <div className="flex-shrink-0 px-4 py-3 flex items-center justify-between">
        <button
          onClick={prev}
          disabled={index === 0}
          className="px-4 py-2 text-sm font-bold text-warm-400 hover:text-white disabled:text-warm-700 disabled:cursor-not-allowed transition-colors"
        >
          &larr; Previous
        </button>

        <span className="text-xs text-warm-500 font-mono">
          {index + 1} / {total}
        </span>

        {isLast ? (
          <button
            onClick={close}
            className="px-4 py-2 text-sm font-bold text-green-400 hover:text-green-300 transition-colors"
          >
            Done
          </button>
        ) : (
          <button
            onClick={next}
            className="px-4 py-2 text-sm font-bold text-yellow-400 hover:text-yellow-300 transition-colors"
          >
            Next &rarr;
          </button>
        )}
      </div>
    </div>
  );
}
