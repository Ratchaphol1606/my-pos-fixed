import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;  // mapped from PUBLISHABLE_KEY in .env.local

const isBrowser = typeof window !== 'undefined'

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // The login lives in localStorage so it survives refreshes and closing the tab
    // or app. It ends at the server's daily cutoff (see nextCutoff in session.ts):
    // the pos_session cookie expires then and PinLock logs out.
    storage: isBrowser ? window.localStorage : undefined,
    persistSession: isBrowser,
    autoRefreshToken: isBrowser,
    detectSessionInUrl: false,
  },
});
