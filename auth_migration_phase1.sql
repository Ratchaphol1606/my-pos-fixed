-- =====================================================================
-- AUTH MIGRATION — PHASE 1  (additive: safe to run while the PIN login is live)
-- Run in Supabase → SQL Editor. Idempotent: running it twice is fine.
--
-- What it does
--   1. profiles   one row per staff login (username, display name, role, active flag)
--   2. user_pins  per-user 4-digit PIN hash + failed-attempt counter.
--                 RLS on and NO policies on purpose → only the server (service role) can touch it.
--   3. Helpers    app_role(), is_staff(), is_admin()  — used by the Phase 2 policies
--   4. Mirror     copies every anon-only policy (public + storage) onto the `authenticated`
--                 role, so a logged-in browser can do exactly what the anon browser does today.
--   5. Grants     lets `authenticated` call process_sale (process_refund stays service-role only)
--
-- What it does NOT do (that is Phase 2, after the new login is tested)
--   - drop the anon policies / revoke anon access
--   - switch policies to role-based (admin vs cashier)
-- =====================================================================


-- ---------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username     text NOT NULL UNIQUE,
  display_name text NOT NULL,
  role         text NOT NULL DEFAULT 'cashier',
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_username_format CHECK (username ~ '^[a-z0-9._-]{3,30}$'),
  CONSTRAINT profiles_role_valid      CHECK (role IN ('admin', 'cashier'))
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Browsers may only READ profiles. Creating / editing users goes through the
-- server (service role) from the admin /users page.
REVOKE ALL ON public.profiles FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;


-- ---------------------------------------------------------------------
-- 2. user_pins  (server-only)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_pins (
  user_id         uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  pin_hash        text NOT NULL,
  failed_attempts int  NOT NULL DEFAULT 0,
  locked_at       timestamptz,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_pins ENABLE ROW LEVEL SECURITY;   -- no policies = browser can never read hashes
REVOKE ALL ON public.user_pins FROM anon, authenticated;


-- ---------------------------------------------------------------------
-- 3. Helper functions
--    SECURITY DEFINER so they can read profiles without tripping profiles' own RLS.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() AND is_active
$$;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.app_role() IS NOT NULL
$$;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(public.app_role() = 'admin', false)
$$;

REVOKE ALL ON FUNCTION public.app_role(), public.is_staff(), public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.app_role(), public.is_staff(), public.is_admin() TO authenticated;

-- profiles policies (need is_admin() to exist first)
DROP POLICY IF EXISTS "profiles: read own" ON public.profiles;
CREATE POLICY "profiles: read own" ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles: admin reads all" ON public.profiles;
CREATE POLICY "profiles: admin reads all" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin());


-- ---------------------------------------------------------------------
-- 4. Mirror anon-only policies onto `authenticated`
--    When the browser logs in, Supabase switches its role from anon to
--    authenticated. Without this, a logged-in browser would suddenly lose
--    access to every table. Policies already granted to PUBLIC or to both
--    roles are skipped. Anon policies are left untouched.
-- ---------------------------------------------------------------------
DO $$
DECLARE
  p        record;
  new_name text;
BEGIN
  FOR p IN
    SELECT *
    FROM   pg_policies
    WHERE  schemaname IN ('public', 'storage')
      AND  roles = '{anon}'
  LOOP
    new_name := p.policyname || ' (authenticated)';

    IF EXISTS (
      SELECT 1 FROM pg_policies x
      WHERE  x.schemaname = p.schemaname
        AND  x.tablename  = p.tablename
        AND  x.policyname = new_name
    ) THEN
      CONTINUE;
    END IF;

    BEGIN
      EXECUTE format(
        'CREATE POLICY %I ON %I.%I AS %s FOR %s TO authenticated%s%s',
        new_name, p.schemaname, p.tablename, p.permissive, p.cmd,
        CASE WHEN p.qual       IS NOT NULL THEN ' USING ('      || p.qual       || ')' ELSE '' END,
        CASE WHEN p.with_check IS NOT NULL THEN ' WITH CHECK (' || p.with_check || ')' ELSE '' END
      );
      RAISE NOTICE 'mirrored: %.% -> "%"', p.schemaname, p.tablename, new_name;
    EXCEPTION WHEN insufficient_privilege THEN
      -- Storage policies are sometimes owned by another role. If you see this,
      -- add the same policy for `authenticated` in Dashboard → Storage → Policies.
      RAISE NOTICE 'SKIPPED (no privilege): %.% "%"', p.schemaname, p.tablename, p.policyname;
    END;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 5. Let logged-in users call process_sale (every overload).
--    process_refund is intentionally NOT granted: it stays service-role only.
-- ---------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM   pg_proc
    WHERE  pronamespace = 'public'::regnamespace
      AND  proname = 'process_sale'
  LOOP
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- Result check: policies `authenticated` now has (this is what the SQL
-- editor shows after the run).
-- ---------------------------------------------------------------------
SELECT schemaname, tablename, policyname, cmd
FROM   pg_policies
WHERE  roles @> '{authenticated}'
  AND  schemaname IN ('public', 'storage')
ORDER  BY schemaname, tablename, policyname;


-- =====================================================================
-- AFTER RUNNING THIS (one-time setup, not part of the migration)
--
-- A. Supabase → Authentication → Sign In / Providers
--      turn OFF "Allow new users to sign up"   (only the admin creates accounts)
--      turn OFF "Confirm email"                (staff logins use a hidden address)
--
-- B. Create the first admin
--    Authentication → Users → Add user → Create new user
--      Email:    bro@staff.boonsamarnshop.com      (username@staff.boonsamarnshop.com)
--      Password: your choice        Auto Confirm User: ON
--    then run:
--
--   INSERT INTO public.profiles (id, username, display_name, role)
--   SELECT id, 'bro', 'Bro', 'admin'
--   FROM   auth.users
--   WHERE  email = 'bro@staff.boonsamarnshop.com'
--   ON CONFLICT (id) DO NOTHING;
-- =====================================================================
