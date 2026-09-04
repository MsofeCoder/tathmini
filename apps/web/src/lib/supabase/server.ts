import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client — reads/writes the session cookie via
 * next/headers. Cookie writes silently no-op when called from a Server
 * Component (expected: middleware.ts is what actually refreshes the
 * session on every request; a Server Component only needs to read it).
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component — middleware.ts refreshes
            // the session cookie instead, so this is safe to ignore.
          }
        },
      },
    },
  );
}
