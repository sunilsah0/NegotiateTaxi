'use client';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export default function Reveal({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { threshold: 0.15 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={`nt-reveal ${shown ? 'is-in' : ''}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </div>
  );
}