import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { parseSlides, type Slide } from './slideParser';
import { UnitCard } from '../../components/UnitCard';
import type { CardView } from '../../types';
import './styles.css';

export default function PresentationViewer() {
  const { id } = useParams<{ id: string }>();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const slideContentRef = useRef<HTMLDivElement>(null);
  const componentRootsRef = useRef<ReturnType<typeof createRoot>[]>([]);

  useEffect(() => {
    async function loadPresentation() {
      try {
        const response = await fetch(`./presentations/${id}/slides.md`);
        if (!response.ok) throw new Error('Presentation not found');
        const markdown = await response.text();
        setSlides(parseSlides(markdown));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setLoading(false);
      }
    }
    loadPresentation();
  }, [id]);

  const goTo = useCallback((index: number) => {
    setCurrentSlide(Math.max(0, Math.min(index, slides.length - 1)));
  }, [slides.length]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goTo(currentSlide + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goTo(currentSlide - 1);
      } else if (e.key === 'Escape') {
        window.location.hash = '/presentations';
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [currentSlide, goTo]);

  // Render React components into placeholder divs
  useEffect(() => {
    if (!slideContentRef.current) return;

    // Store roots created in this effect run
    const roots: ReturnType<typeof createRoot>[] = [];

    const placeholders = slideContentRef.current.querySelectorAll('.component-placeholder');
    placeholders.forEach(placeholder => {
      const componentType = placeholder.getAttribute('data-component');
      const propsStr = placeholder.getAttribute('data-props');

      if (!componentType || !propsStr) return;

      // Skip if already has children (already rendered)
      if (placeholder.children.length > 0) return;

      try {
        const props = JSON.parse(propsStr);
        const root = createRoot(placeholder);
        roots.push(root);

        if (componentType === 'unit-card') {
          const cardData: CardView = {
            id: props.id ?? 0,
            template_id: String(props.template_id ?? '0'),
            name: props.name || 'Unit',
            attack: props.attack ?? 2,
            health: props.health ?? 3,
            play_cost: props.play_cost ?? 2,
            pitch_value: props.pitch_value ?? 1,
            abilities: props.abilities || [],
          };
          root.render(
            <div className="inline-block transform scale-150 mx-4">
              <UnitCard card={cardData} showCost={props.showCost !== false} showPitch={props.showPitch !== false} />
            </div>
          );
        }
      } catch (e) {
        console.error('Failed to render component:', e);
      }
    });

    // Update ref for cleanup
    componentRootsRef.current = roots;

    return () => {
      // Use setTimeout to defer unmount and avoid race condition
      const rootsToUnmount = [...roots];
      setTimeout(() => {
        rootsToUnmount.forEach(root => {
          try {
            root.unmount();
          } catch {
            // Ignore errors if already unmounted
          }
        });
      }, 0);
    };
  }, [currentSlide, slides]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <p>Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-4">
        <p className="text-red-400">{error}</p>
        <Link to="/presentations" className="text-blue-400 hover:text-blue-300">
          ← Back to Presentations
        </Link>
      </div>
    );
  }

  const slide = slides[currentSlide];

  return (
    <div className="min-h-screen bg-gray-900 text-white flex flex-col">
      {/* Slide content */}
      <div
        className="flex-1 flex items-center justify-center p-8"
        onClick={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const x = e.clientX - rect.left;
          if (x > rect.width / 2) {
            goTo(currentSlide + 1);
          } else {
            goTo(currentSlide - 1);
          }
        }}
      >
        <div
          ref={slideContentRef}
          className="slide-content max-w-4xl w-full"
          dangerouslySetInnerHTML={{ __html: slide?.html || '' }}
        />
      </div>

      {/* Navigation bar */}
      <div className="bg-gray-800 px-4 py-3 flex items-center justify-between">
        <Link
          to="/presentations"
          className="text-gray-400 hover:text-white text-sm"
        >
          ← Back
        </Link>

        <div className="flex items-center gap-4">
          <button
            onClick={() => goTo(currentSlide - 1)}
            disabled={currentSlide === 0}
            className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50"
          >
            Prev
          </button>

          <span className="text-gray-400 text-sm min-w-[80px] text-center">
            {currentSlide + 1} / {slides.length}
          </span>

          <button
            onClick={() => goTo(currentSlide + 1)}
            disabled={currentSlide === slides.length - 1}
            className="px-3 py-1 bg-gray-700 rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>

        <span className="text-gray-500 text-xs">
          ← → or click to navigate
        </span>
      </div>
    </div>
  );
}
