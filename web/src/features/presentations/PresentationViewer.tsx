import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { createRoot } from 'react-dom/client';
import { parseSlides, type Slide } from './slideParser';
import { UnitCard } from '../../components/UnitCard';
import { BattleSlideComponent } from './BattleSlideComponent';
import { ShopSlideComponent } from './ShopSlideComponent';
import { CardCreatorSlideComponent } from './CardCreatorSlideComponent';
import { SetCreatorSlideComponent } from './SetCreatorSlideComponent';
import { CardBreakdownComponent } from './CardBreakdownComponent';
import type { CardView } from '../../types';
import './styles.css';

export default function PresentationViewer() {
  const { id, slideNum } = useParams<{ id: string; slideNum?: string }>();
  const navigate = useNavigate();
  const [slides, setSlides] = useState<Slide[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const slideContentRef = useRef<HTMLDivElement>(null);
  const componentRootsRef = useRef<Map<Element, ReturnType<typeof createRoot>>>(new Map());

  // Initialize slide from URL parameter or redirect to slide 1
  useEffect(() => {
    if (slides.length > 0) {
      if (slideNum) {
        const num = parseInt(slideNum, 10);
        if (!isNaN(num) && num >= 1 && num <= slides.length) {
          setCurrentSlide(num - 1); // URL is 1-indexed, state is 0-indexed
        } else {
          // Invalid slide number, redirect to slide 1
          navigate(`/presentations/${id}/1`, { replace: true });
        }
      } else {
        // No slide number in URL, redirect to slide 1
        navigate(`/presentations/${id}/1`, { replace: true });
      }
    }
  }, [slideNum, slides.length, navigate, id]);

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
    const newSlide = Math.max(0, Math.min(index, slides.length - 1));
    setCurrentSlide(newSlide);
    // Update URL with 1-indexed slide number
    navigate(`/presentations/${id}/${newSlide + 1}`, { replace: true });
  }, [slides.length, navigate, id]);

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

    const rootMap = componentRootsRef.current;
    const activePlaceholders = new Set<Element>();

    const placeholders = slideContentRef.current.querySelectorAll('.component-placeholder');
    placeholders.forEach(placeholder => {
      const componentType = placeholder.getAttribute('data-component');
      const propsStr = placeholder.getAttribute('data-props');

      if (!componentType || !propsStr) return;

      activePlaceholders.add(placeholder);

      try {
        const props = JSON.parse(propsStr);

        // Reuse existing root or create a new one
        let root = rootMap.get(placeholder);
        if (!root) {
          root = createRoot(placeholder);
          rootMap.set(placeholder, root);
        }

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
            <div className="inline-block transform scale-150 origin-center m-8">
              <UnitCard card={cardData} showCost={props.showCost !== false} showPitch={props.showPitch !== false} />
            </div>
          );
        } else if (componentType === 'card-breakdown') {
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
          root.render(<CardBreakdownComponent card={cardData} />);
        } else if (componentType === 'shop-demo') {
          root.render(<ShopSlideComponent />);
        } else if (componentType === 'card-creator') {
          root.render(<CardCreatorSlideComponent />);
        } else if (componentType === 'set-creator') {
          root.render(<SetCreatorSlideComponent />);
        } else if (componentType === 'battle-arena') {
          root.render(
            <BattleSlideComponent
              playerUnits={props.playerUnits || []}
              enemyUnits={props.enemyUnits || []}
              seed={props.seed}
            />
          );
        }
      } catch (e) {
        console.error('Failed to render component:', e);
      }
    });

    // Clean up roots for placeholders no longer in the DOM (slide changed)
    // Defer unmount to avoid "synchronously unmount while rendering" warning
    const staleRoots: ReturnType<typeof createRoot>[] = [];
    for (const [element, root] of rootMap) {
      if (!activePlaceholders.has(element)) {
        staleRoots.push(root);
        rootMap.delete(element);
      }
    }
    if (staleRoots.length > 0) {
      setTimeout(() => {
        staleRoots.forEach(root => {
          try {
            root.unmount();
          } catch {
            // Ignore if already unmounted
          }
        });
      }, 0);
    }
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
      <div className="flex-1 flex items-center justify-center p-8">
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
          ← → to navigate
        </span>
      </div>
    </div>
  );
}
