'use client';

export default function PoolPopup({ onChoose, onClose }: { onChoose: (allow: boolean) => void; onClose: () => void }) {
  return (
    <div className="nt-modal-back" onClick={onClose}>
      <div className="nt-modal nt-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="pool-title">
        <h2 id="pool-title" className="nt-h3">Share your ride?</h2>
        <p className="nt-muted">
          Allow your driver to pick up one more passenger who is travelling the same route as you? Your price stays the same
          and you will see who joins. Only passengers who also allowed sharing and travel nearly the same route can be added.
        </p>
        <button className="nt-btn nt-primary" onClick={() => onChoose(true)}>Yes, allow one more passenger</button>
        <button className="nt-btn" onClick={() => onChoose(false)}>No, just me</button>
        <button className="nt-btn sm" onClick={onClose}>Back</button>
      </div>
    </div>
  );
}