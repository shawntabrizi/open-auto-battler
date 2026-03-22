import { useEffect, useRef } from 'react';
import { useThemeStore } from '../store/themeStore';
import { type ParticleConfig, type ThemeIcon } from '../theme/themes';
import { ipfsUrl } from '../utils/ipfs';

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

function hexToRgb(hex: string): [number, number, number] {
  const normalized = hex.replace('#', '');
  const value =
    normalized.length === 3
      ? normalized
          .split('')
          .map((c) => c + c)
          .join('')
      : normalized;
  const int = Number.parseInt(value, 16);
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

/** Build Path2D objects from ThemeIcon paths (cached once per effect cycle) */
function buildPath2Ds(icon: ThemeIcon): Path2D[] {
  return icon.paths.map((d) => new Path2D(d));
}

/** Draw a custom icon (Path2D) scaled to particle size */
function drawIcon(ctx: CanvasRenderingContext2D, p: Particle, paths: Path2D[]) {
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  // SVG paths are in a 24×24 viewBox — scale to particle size
  const scale = (p.radius * 2) / 24;
  ctx.scale(scale, scale);
  ctx.translate(-12, -12); // center the 24×24 icon
  for (const path of paths) {
    ctx.fill(path);
  }
  ctx.restore();
}

/** Draw an image scaled to particle size */
function drawImage(ctx: CanvasRenderingContext2D, p: Particle, img: HTMLImageElement) {
  const size = p.radius * 2;
  ctx.save();
  ctx.globalAlpha = p.alpha;
  ctx.translate(p.x, p.y);
  ctx.rotate(p.rotation);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
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
    const sizeMul = pc.size;
    const icon = pc.icon;

    // Resolve particle color: custom color > accent
    let ar: number, ag: number, ab: number;
    if (pc.color) {
      [ar, ag, ab] = hexToRgb(pc.color);
    } else {
      const accentRgb =
        getComputedStyle(document.documentElement)
          .getPropertyValue('--color-accent')
          .trim() || '212 168 67';
      [ar, ag, ab] = accentRgb.split(' ').map(Number);
    }

    // Pre-build Path2D objects
    const paths = buildPath2Ds(icon);

    // Pre-load image if url is set
    let img: HTMLImageElement | null = null;
    let imageReady = false;
    if (icon.url) {
      img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        imageReady = true;
      };
      img.src = ipfsUrl(icon.url);
    }

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
        vy: (Math.random() - 0.5) * 0.3,
        radius: (Math.random() * 2 + 0.5) * sizeMul,
        alpha: Math.random() * 0.4 + 0.1,
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

        if (img && imageReady) {
          drawImage(ctx, p, img);
        } else {
          ctx.fillStyle = `rgba(${ar}, ${ag}, ${ab}, ${p.alpha})`;
          ctx.shadowBlur = 4;
          ctx.shadowColor = `rgba(${ar}, ${ag}, ${ab}, 0.3)`;
          drawIcon(ctx, p, paths);
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
