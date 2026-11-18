'use client';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

const FIELDS: [string, string][] = [
  ['start_fee', 'Start fee (kr)'],
  ['per_km', 'Per km (kr)'],
  ['per_hour_std', 'Per hour, normal times (kr)'],
  ['per_hour_peak', 'Per hour, Fri 15:00 to Mon 06:00 (kr)'],
  ['min_fare', 'Smallest guide price (kr)'],
  ['floor_pct', 'Minimum bid (% of guide)'],
  ['ceil_pct', 'Maximum bid (% of guide)'],
  ['pool_radius_km', 'Shared-ride radius (km)'],
];

export default function PricingEditor() {
  const [vals, setVals] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');

  useEffect(() => {
    supabase.from('pricing_config').select('*').eq('id', 1).maybeSingle().then(({ data }) => {
      if (data) setVals(Object.fromEntries(FIELDS.map(([k]) => [k, String(data[k])])));
    });
  }, []);

  async function save() {
    const row = Object.fromEntries(FIELDS.map(([k]) => [k, Number(vals[k])]));
    if (Object.values(row).some((n) => !Number.isFinite(n) || n < 0)) { setMsg('Please enter valid numbers.'); return; }
    if (row.floor_pct > 100 || row.ceil_pct < 100) { setMsg('Minimum bid must be 100% or less, maximum 100% or more.'); return; }
    const { error } = await supabase.from('pricing_config').update(row).eq('id', 1);
    setMsg(error ? error.message : 'Saved. New requests use these prices.');
  }

  return (
    <div className="nt-card">
      <h2 className="nt-h3">Pricing (Swedish market)</h2>
      {FIELDS.map(([k, label]) => (
        <label key={k} className="nt-muted">
          {label}
          <input className="nt-input" type="number" step="any" value={vals[k] ?? ''} onChange={(e) => setVals({ ...vals, [k]: e.target.value })} />
        </label>
      ))}
      <button className="nt-btn nt-primary" onClick={save}>Save pricing</button>
      {msg && <p className="nt-muted">{msg}</p>}
    </div>
  );
}