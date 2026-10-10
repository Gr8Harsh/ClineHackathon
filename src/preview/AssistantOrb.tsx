import { useEffect, useRef } from 'react';

// Local, decorative artwork inspired by the supplied flowing-form references.
// No remote assets, microphone input, or medical state drive this animation.
export function AssistantOrb() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext('2d');
    if (!canvas || !context) return;
    const size = 320;
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = size * scale;
    canvas.height = size * scale;
    context.scale(scale, scale);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let visible = true;
    let last = 0;
    let time = 0;

    function draw() {
      if (!context) return;
      context.clearRect(0, 0, size, size);
      const turn = time * .16;
      const tilt = -.28 + Math.sin(time * .3) * .15;
      // Latitude threads on a slowly deforming, rotated surface.
      const threadCount = 70;
      for (let ring = 1; ring < threadCount; ring++) {
        const latitude = Math.PI * ring / threadCount;
        context.beginPath();
        for (let point = 0; point <= 128; point++) {
          const longitude = Math.PI * 2 * point / 128;
          const ripple = 1 + .2 * Math.sin(longitude * 3 + time * .55 + latitude * 2) * Math.sin(latitude)
            + .1 * Math.cos(latitude * 5 - time * .7);
          const radius = 103 * ripple;
          const x = radius * Math.sin(latitude) * Math.cos(longitude);
          const y = radius * Math.cos(latitude);
          const z = radius * Math.sin(latitude) * Math.sin(longitude);
          const rotatedX = x * Math.cos(turn) + z * Math.sin(turn);
          const rotatedZ = z * Math.cos(turn) - x * Math.sin(turn);
          const rotatedY = y * Math.cos(tilt) - rotatedZ * Math.sin(tilt);
          const depth = y * Math.sin(tilt) + rotatedZ * Math.cos(tilt);
          const perspective = 430 / (430 - depth);
          const px = 160 + rotatedX * perspective;
          const py = 160 + rotatedY * perspective;
          if (point === 0) context.moveTo(px, py);
          else context.lineTo(px, py);
        }
        const gradient = context.createLinearGradient(70, 50, 240, 275);
        gradient.addColorStop(0, 'rgba(139, 190, 114, .55)');
        gradient.addColorStop(.35, 'rgba(64, 137, 83, .75)');
        gradient.addColorStop(.7, 'rgba(37, 100, 63, .65)');
        gradient.addColorStop(1, 'rgba(114, 161, 78, .3)');
        context.strokeStyle = gradient;
        context.lineWidth = .65;
        context.stroke();
      }
    }

    function tick(now: number) {
      if (now - last >= 32) {
        time += last ? Math.min((now - last) / 1000, .05) : 0;
        last = now;
        draw();
      }
      frame = requestAnimationFrame(tick);
    }
    function sync() {
      cancelAnimationFrame(frame);
      last = 0;
      if (reducedMotion.matches) time = 0;
      draw();
      if (visible && !document.hidden && !reducedMotion.matches) frame = requestAnimationFrame(tick);
    }
    const observer = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; sync(); });
    observer.observe(canvas);
    reducedMotion.addEventListener('change', sync);
    document.addEventListener('visibilitychange', sync);
    sync();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      reducedMotion.removeEventListener('change', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);

  return <div className="assistant-orb" aria-hidden="true"><canvas ref={canvasRef} /></div>;
}
