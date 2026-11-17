'use client';
import Link from 'next/link';
import { useEffect, useRef } from 'react';
import Reveal from '../components/Reveal';

const MARQUEE = ['Binding fixed price', 'Live tracking', 'Licensed drivers only', 'SOS button', 'Share a ride with a friend', 'Built for Sweden'];

export default function Home() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - window.innerHeight;
      const el = rootRef.current;
      if (el) {
        el.style.setProperty('--y', String(Math.round(y)));
        el.style.setProperty('--p', String(max > 0 ? y / max : 0));
      }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { window.removeEventListener('scroll', onScroll); if (raf) cancelAnimationFrame(raf); };
  }, []);

  return (
    <div className="nt-app" ref={rootRef}>
      <div className="nt-progress" />
      <nav className="nt-nav">
        <span className="nt-brand">Negotiate <span>Taxi</span></span>
        <div className="nt-row">
          <Link className="nt-btn sm" href="/driver">Drive</Link>
          <Link className="nt-btn sm nt-primary" href="/rider">Ride</Link>
        </div>
      </nav>

      <header className="nt-hero">
        <div className="nt-hero-bg" />
        <div className="nt-hero-inner">
          <span className="nt-live">Prototype · Stockholm</span>
          <h1 className="nt-title">Name your price.<br /><span className="nt-grad">Ride Stockholm.</span></h1>
          <p className="nt-sub">Offer a fare, let licensed drivers counter, and lock a binding price before the ride starts. Then watch every kilometre live.</p>
          <div className="nt-row" style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link className="nt-btn nt-primary" href="/rider">Book a ride</Link>
            <Link className="nt-btn" href="/driver">Become a driver</Link>
          </div>
        </div>
        <div className="nt-road" />
      </header>

      <div className="nt-marquee">
        <div className="nt-marquee-track">
          {[...MARQUEE, ...MARQUEE].map((t, i) => <span key={i}>◆ {t}</span>)}
        </div>
      </div>

      <section className="nt-section">
        <Reveal><h2 className="nt-h2">Three steps. <span className="nt-grad">One fair price.</span></h2></Reveal>
        <div className="nt-grid">
          {[
            ['01', 'Offer', 'Pick a destination. We show a fair price range for the trip, and you name your own offer.'],
            ['02', 'Negotiate', 'Licensed drivers accept or counter in real time. You choose the offer you like.'],
            ['03', 'Ride', 'The price is locked. Follow your driver live and share the trip with a friend.'],
          ].map(([n, t, d], i) => (
            <Reveal key={n} delay={i * 120}>
              <div className="nt-card"><span className="nt-num">{n}</span><h3 className="nt-h3">{t}</h3><p className="nt-muted">{d}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="nt-section nt-split2">
        <Reveal>
          <h2 className="nt-h2">A fair deal, <span className="nt-grad">negotiated live.</span></h2>
          <p className="nt-muted">No hidden extras. Every offer is visible, and the final price is binding for both sides.</p>
        </Reveal>
        <Reveal delay={150}>
          <div className="nt-card">
            <div className="nt-bubble me">I offer 260 kr to Kista</div>
            <div className="nt-bubble">Anna counters: 310 kr</div>
            <div className="nt-bubble me">Meet in the middle: 285 kr?</div>
            <div className="nt-bubble">Accepted. Price locked at 285 kr ✓</div>
          </div>
        </Reveal>
      </section>

      <section className="nt-section">
        <Reveal>
          <h2 className="nt-h2">Every move, <span className="nt-grad">live.</span></h2>
          <p className="nt-muted">Riders, drivers, a trusted friend and our control room all see the same live map.</p>
        </Reveal>
        <Reveal delay={150}>
          <div className="nt-card" style={{ marginTop: 24 }}>
            <svg viewBox="0 0 400 200" width="100%" role="img" aria-label="Animated route preview">
              <path d="M30 170 C 90 30, 170 190, 230 100 S 350 40, 372 56" fill="none" stroke="rgba(250,204,21,.5)" strokeWidth="3" strokeDasharray="6 8" />
              <circle cx="30" cy="170" r="7" fill="#22c55e" />
              <circle cx="372" cy="56" r="7" fill="#ef4444" />
              <circle r="8" fill="#3b82f6">
                <animateMotion dur="7s" repeatCount="indefinite" path="M30 170 C 90 30, 170 190, 230 100 S 350 40, 372 56" />
              </circle>
            </svg>
          </div>
        </Reveal>
      </section>

      <section className="nt-section">
        <Reveal><h2 className="nt-h2">Built for <span className="nt-grad">trust.</span></h2></Reveal>
        <div className="nt-grid">
          {[
            ['Licensed drivers', 'Drivers are approved by an admin before they can bid.'],
            ['Binding price', 'The agreed price is locked and shown to rider and driver.'],
            ['SOS button', 'One tap alerts the control room with your live location.'],
            ['Share with a friend', 'A verified friend follows your trip live, only while it lasts.'],
          ].map(([t, d], i) => (
            <Reveal key={t} delay={i * 100}>
              <div className="nt-card"><h3 className="nt-h3">{t}</h3><p className="nt-muted">{d}</p></div>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="nt-section">
        <Reveal><h2 className="nt-h2">Choose your <span className="nt-grad">side.</span></h2></Reveal>
        <div className="nt-grid">
          {[
            ['/rider', 'Rider', 'Book and track rides'],
            ['/driver', 'Driver', 'Go online and take offers'],
            ['/admin', 'Admin', 'Live control room'],
          ].map(([href, t, d], i) => (
            <Reveal key={href} delay={i * 100}>
              <Link href={href} className="nt-card" style={{ textDecoration: 'none', color: 'inherit' }}>
                <h3 className="nt-h3">{t} →</h3><p className="nt-muted">{d}</p>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <footer className="nt-section" style={{ paddingTop: 0 }}>
        <p className="nt-muted">Negotiate Taxi is a learning prototype. Running a real taxi service in Sweden requires a taxi permit, licensed drivers and a taximeter in every car.</p>
      </footer>
    </div>
  );
}