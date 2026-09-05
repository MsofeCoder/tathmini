import { InstallGate } from './install-gate';
import { createClient } from '@/lib/supabase/server';

// "/" is now a public path (middleware.ts) so the install splash can
// reach a signed-out first-time visitor — see install-gate.tsx for why.
// It renders unconditionally; InstallGate itself decides client-side
// whether to show it or skip straight to `destination` (already
// installed, or seen before). /home decides for itself whether that's
// /change-password (first sign-in) or the placeholder landing.
export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <InstallGate destination={user ? '/home' : '/login'} />;
}
