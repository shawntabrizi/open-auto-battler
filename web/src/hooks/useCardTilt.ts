import { useCallback, useRef, useEffect } from 'react';

interface UseCardTiltOptions {
  enabled?: boolean;
  maxRotation?: number;
  glareOpacity?: number;
  perspective?: number;
  springDuration?: number;
}

/**
 * Custom hook for 3D card tilt effect via direct DOM manipulation (zero React re-renders).
 * Sets CSS custom properties: --tilt-x, --tilt-y, --glare-x, --glare-y, --glare-opacity
 * Only active on devices with hover capability (disabled on touch).
 */
export function useCardTilt({
  enabled = true,
  maxRotation = 12,
  glareOpacity = 0.15,
  perspective: _perspective = 600,
  springDuration = 400,
}: UseCardTiltOptions = {}) {
  const elementRef = useRef<HTMLDivElement | null>(null);
  const rafId = useRef<number>(0);
  const supportsHover = useRef(false);

  // Check hover support once
  useEffect(() => {
    supportsHover.current = window.matchMedia('(hover: hover)').matches;
  }, []);

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !enabled || !supportsHover.current) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (rafId.current) cancelAnimationFrame(rafId.current);

      rafId.current = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width; // 0..1
        const y = (e.clientY - rect.top) / rect.height; // 0..1

        // Rotation: center = 0, edges = ±maxRotation
        const rotateX = (0.5 - y) * maxRotation; // tilt up when cursor is at top
        const rotateY = (x - 0.5) * maxRotation; // tilt right when cursor is at right

        el.style.setProperty('--tilt-x', `${rotateX}deg`);
        el.style.setProperty('--tilt-y', `${rotateY}deg`);
        el.style.setProperty('--glare-x', `${x * 100}%`);
        el.style.setProperty('--glare-y', `${y * 100}%`);
        el.style.setProperty('--glare-opacity', `${glareOpacity}`);
        // Remove transition during active movement for instant response
        el.style.setProperty('--tilt-transition', '0ms');
      });
    };

    const handleMouseEnter = () => {
      el.style.setProperty('--tilt-transition', '0ms');
    };

    const handleMouseLeave = () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      // Spring back to flat
      el.style.setProperty('--tilt-transition', `${springDuration}ms`);
      el.style.setProperty('--tilt-x', '0deg');
      el.style.setProperty('--tilt-y', '0deg');
      el.style.setProperty('--glare-opacity', '0');
    };

    el.addEventListener('mouseenter', handleMouseEnter);
    el.addEventListener('mousemove', handleMouseMove);
    el.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
      el.removeEventListener('mouseenter', handleMouseEnter);
      el.removeEventListener('mousemove', handleMouseMove);
      el.removeEventListener('mouseleave', handleMouseLeave);
      // Reset properties on cleanup
      el.style.removeProperty('--tilt-x');
      el.style.removeProperty('--tilt-y');
      el.style.removeProperty('--glare-x');
      el.style.removeProperty('--glare-y');
      el.style.removeProperty('--glare-opacity');
      el.style.removeProperty('--tilt-transition');
    };
  }, [enabled, maxRotation, glareOpacity, springDuration]);

  const tiltRef = useCallback((node: HTMLDivElement | null) => {
    elementRef.current = node;
  }, []);

  return { tiltRef, supportsHover };
}
