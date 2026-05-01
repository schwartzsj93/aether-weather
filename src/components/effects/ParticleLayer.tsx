import { useEffect, useRef } from 'react';

type ParticleKind = 'rain' | 'snow' | 'none';

interface Props {
  weatherCode: number;
  intensity?: number; // 0..1
}

function kindFor(code: number): ParticleKind {
  if ([51, 53, 55, 61, 63, 65, 80, 81, 82, 95, 96, 99].includes(code)) return 'rain';
  if ([56, 57, 66, 67, 71, 73, 75, 77, 85, 86].includes(code)) return 'snow';
  return 'none';
}

/**
 * Lightweight canvas particle field for rain/snow.
 * Sized in CSS pixels with devicePixelRatio scaling so it stays crisp
 * without blowing the GPU. ~150 particles total — invisible runtime cost.
 */
export function ParticleLayer({ weatherCode, intensity = 0.7 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const kind = kindFor(weatherCode);

  useEffect(() => {
    if (kind === 'none') return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = 0;
    let h = 0;
    const resize = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    interface P { x: number; y: number; vx: number; vy: number; r: number; o: number; }
    const count = Math.round(120 + intensity * 120);
    const particles: P[] = Array.from({ length: count }, () => spawn());

    function spawn(): P {
      if (kind === 'rain') {
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          vx: -1.5,
          vy: 8 + Math.random() * 6,
          r: 1,
          o: 0.18 + Math.random() * 0.35,
        };
      }
      return {
        x: Math.random() * w,
        y: Math.random() * h,
        vx: (Math.random() - 0.5) * 0.6,
        vy: 0.6 + Math.random() * 1.4,
        r: 1 + Math.random() * 2.2,
        o: 0.4 + Math.random() * 0.5,
      };
    }

    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.x += p.vx;
        p.y += p.vy;
        if (p.y > h + 4 || p.x < -4 || p.x > w + 4) {
          Object.assign(p, spawn(), { y: -4, x: Math.random() * w });
        }
        if (kind === 'rain') {
          ctx.strokeStyle = `rgba(186,230,253,${p.o})`;
          ctx.lineWidth = p.r;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 1.5, p.y - p.vy * 1.5);
          ctx.stroke();
        } else {
          ctx.fillStyle = `rgba(241,245,249,${p.o})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    };
  }, [kind, intensity]);

  if (kind === 'none') return null;
  return (
    <canvas
      ref={canvasRef}
      aria-hidden
      className="pointer-events-none fixed inset-0 -z-[5]"
      style={{ width: '100vw', height: '100vh' }}
    />
  );
}
