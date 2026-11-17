'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';

export default function AppShell({ label, name, onLogout, children }: {
  label: string; name?: string | null; onLogout: () => void; children: ReactNode;
}) {
  return (
    <div className="nt-app">
      <header className="nt-top">
        <Link href="/" className="nt-brand">Negotiate <span>Taxi</span></Link>
        <div className="nt-row">
          <span className="nt-live">{label}</span>
          <span className="nt-muted">{name}</span>
          <button className="nt-btn sm" onClick={onLogout}>Log out</button>
        </div>
      </header>
      {children}
    </div>
  );
}