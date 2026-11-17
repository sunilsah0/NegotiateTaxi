'use client';
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from './supabase';
import type { Profile } from './types';

export function useProfile() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [doneFor, setDoneFor] = useState<string | null>(null);
  const userId = session?.user.id ?? null;

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!userId) { setProfile(null); setDoneFor(null); return; }
    let cancelled = false;
    supabase.from('profiles').select('id, full_name, role, approved').eq('id', userId).maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setProfile((data as Profile | null) ?? null);
        setDoneFor(userId);
      });
    return () => { cancelled = true; };
  }, [userId]);

  const ready = !authLoading && (!userId || doneFor === userId);
  return { session, profile, ready, signOut: () => supabase.auth.signOut() };
}