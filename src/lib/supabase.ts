import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;  // mapped from PUBLISHABLE_KEY in .env.local

const isBrowser = typeof window !== 'undefined'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // The login lives in sessionStorage, not localStorage: closing the tab or the
    // app throws it away, so the next visit asks for the password again. A page
    // refresh keeps it, and the PIN screen handles that case.
    storage: isBrowser ? window.sessionStorage : undefined,
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: false,
  },
});
