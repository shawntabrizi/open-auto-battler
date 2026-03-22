import { useEffect, useRef } from 'react';
import { useThemeStore } from '../store/themeStore';
import { type ParticleShape, type ParticleConfig } from '../theme/themes';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  alpha: number;
  rotation: number;
  rotationSpeed: number;
}

/** Draw a small jagged ember / ash flake */
function drawEmber(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  // Irregular polygon — looks like a floating ash flake
  const s = p.radius;
  ctx.beginPath();
  ctx.moveTo(-s * 0.8, -s * 0.3);
  ctx.lineTo(-s * 0.2, -s);
  ctx.lineTo(s * 0.6, -s * 0.5);
  ctx.lineTo(s, s * 0.2);
  ctx.lineTo(s * 0.3, s * 0.8);
  ctx.lineTo(-s * 0.5, s * 0.6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Draw a soft bokeh circle with radial gradient */
function drawBokeh(ctx: CanvasRenderingContext2D, p: Particle, r: number, g: number, b: number) {
  const size = p.radius * 3;
  const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, size);
  gradient.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.8})`);
  gradient.addColorStop(0.4, `rgba(${r}, ${g}, ${b}, ${p.alpha * 0.3})`);
  gradient.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
  ctx.beginPath();
  ctx.arc(p.x, p.y, size, 0, Math.PI * 2);
  ctx.fillStyle = gradient;
  ctx.fill();
}

/** Draw a small heart shape */
function drawHeart(ctx: CanvasRenderingContext2D, p: Particle) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  const s = p.radius * 1.5;
  ctx.beginPath();
  ctx.moveTo(0, s * 0.4);
  ctx.bezierCurveTo(-s, -s * 0.4, -s * 0.5, -s * 1.2, 0, -s * 0.5);
  ctx.bezierCurveTo(s * 0.5, -s * 1.2, s, -s * 0.4, 0, s * 0.4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

export function ParticleBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const activeTheme = useThemeStore((s) => s.activeTheme);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const theme = activeTheme;
    const pc: ParticleConfig = theme.assets.particles;
    const shape: ParticleShape = pc.shape;
    const sizeMul = pc.size;
    const accentRgb = getComputedStyle(document.documentElement).getPropertyValue('--color-accent').trim() || '212 168 67';
    const [ar, ag, ab] = accentRgb.split(' ').map(Number);

    let animId: number;
    const particles: Particle[] = [];
    const count = pc.count;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.3,
        vy:
          shape === 'ember'
            ? -(Math.random() * 0.2 + 0.05) // embers drift up
            : (Math.random() - 0.5) * 0.3,
        radius: (Math.random() * 2 + 0.5) * sizeMul,
        alpha: shape === 'bokeh' ? Math.random() * 0.15 + 0.05 : Math.random() * 0.4 + 0.1,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.01,
      });
    }

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        if (p.x < 0) p.x = canvas.width;
        if (p.x > canvas.width) p.x = 0;
        if (p.y < 0) p.y = canvas.height;
        if (p.y > canvas.height) p.y = 0;

        if (shape === 'bokeh') {
          ctx.shadowBlur = 0;
          drawBokeh(ctx, p, ar, ag, ab);
        } else {
          ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${p.alpha})`;
          ctx.shadowBlur = shape === 'heart' ? 4 : 8;
          ctx.shadowColor = `rgba(${ar}, ${ag}, ${ab}, 0.3)`;

          if (shape === 'ember') {
            drawEmber(ctx, p);
          } else {
            drawHeart(ctx, p);
          }
        }
      }

      ctx.shadowBlur = 0;
      animId = requestAnimationFrame(draw);
    };

    draw();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [activeTheme]);

  return (
    <canvas ref={canvasRef} className="fixed inset-0 z-0 pointer-events-none" aria-hidden="true" />
  );
}
