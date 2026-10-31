-- =====================================================================
-- AUTH MIGRATION — PHASE 2  (the lockdown)
-- Run in Supabase → SQL Editor, ONLY AFTER:
--   • auth_migration_phase1.sql and audit_migration.sql have been run,
--   • the new login build is deployed and you have logged in with it,
--   • you have tried one sale and one refund with the new login.
-- Idempotent. To undo, run auth_migration_phase2_rollback.sql.
--
-- Before this file: the public (anon) key in the browser could read and write every table.
-- After this file:  nothing works without a login that belongs to an ACTIVE staff profile.
--
--   Tables       RLS on for every table in `public`; anon has no access at all.
--                  default            active staff: read + write   (what the app needs today)
--                  settings           active staff read, ADMIN write
--                  refunds, promotions  active staff read only (writes go through the server)
--                  profiles / user_pins / audit_log  untouched (already locked in earlier files)
--   Views        run with the caller's rights, so they can't leak around RLS
--   Functions    anon cannot call any; logged-in staff can, except process_refund (server only)
--   Storage      only an admin can upload / replace / delete in the `assets` bucket
--   Login screen reads the shop name through public_shop_name() — the one thing anon may call
--
-- Known gap this does NOT close: a logged-in cashier who knows how can still write to
-- sales / products from the browser console, exactly as the shop already allows today
-- (only now it is attributable and needs a login). Closing it means making process_sale
-- SECURITY DEFINER and removing direct writes; that is a separate, riskier change.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. The only thing the login screen may read before anyone is logged in.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.public_shop_name()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT shop_name FROM public.settings WHERE id = 1
$$;


-- ---------------------------------------------------------------------
-- 2. Tables
-- ---------------------------------------------------------------------
DO $$
DECLARE
  t record;
  pol record;
BEGIN
  FOR t IN
    SELECT c.relname AS name
    FROM   pg_class c
    WHERE  c.relnamespace = 'public'::regnamespace
      AND  c.relkind IN ('r', 'p')
      AND  c.relname NOT IN ('profiles', 'user_pins', 'audit_log')
      AND  NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')  -- skip extension tables
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.name);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t.name);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO authenticated', t.name);

    -- Start clean: every old policy (anon, public, and the "(authenticated)" copies from phase 1).
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t.name LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t.name);
    END LOOP;

    IF t.name = 'settings' THEN
      EXECUTE 'CREATE POLICY "staff read"   ON public.settings FOR SELECT TO authenticated USING (public.is_staff())';
      EXECUTE 'CREATE POLICY "admin insert" ON public.settings FOR INSERT TO authenticated WITH CHECK (public.is_admin())';
      EXECUTE 'CREATE POLICY "admin update" ON public.settings FOR UPDATE TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())';
      EXECUTE 'CREATE POLICY "admin delete" ON public.settings FOR DELETE TO authenticated USING (public.is_admin())';
    ELSIF t.name IN ('refunds', 'promotions') THEN
      EXECUTE format('CREATE POLICY "staff read" ON public.%I FOR SELECT TO authenticated USING (public.is_staff())', t.name);
    ELSE
      EXECUTE format(
        'CREATE POLICY "staff all" ON public.%I FOR ALL TO authenticated USING (public.is_staff()) WITH CHECK (public.is_staff())',
        t.name);
    END IF;
    RAISE NOTICE 'locked: public.%', t.name;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 3. Views: no anon, and they must obey the caller's RLS (not the owner's).
-- ---------------------------------------------------------------------
DO $$
DECLARE v record;
BEGIN
  FOR v IN
    SELECT c.relname AS name
    FROM   pg_class c
    WHERE  c.relnamespace = 'public'::regnamespace
      AND  c.relkind IN ('v', 'm')
      AND  NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM anon', v.name);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', v.name);
    BEGIN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = true)', v.name);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'could not set security_invoker on view % (%): check it by hand', v.name, SQLERRM;
    END;
    RAISE NOTICE 'locked view: public.%', v.name;
  END LOOP;
END $$;


-- ---------------------------------------------------------------------
-- 4. Sequences and functions
-- ---------------------------------------------------------------------
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

DO $$
DECLARE f record;
BEGIN
  FOR f IN
    SELECT p.oid::regprocedure AS sig, p.proname AS name, (p.prorettype = 'trigger'::regtype) AS is_trigger
    FROM   pg_proc p
    WHERE  p.pronamespace = 'public'::regnamespace
      AND  p.prokind = 'f'
      AND  NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF f.is_trigger OR f.name = 'process_refund' THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', f.sig);   -- triggers + server-only
    ELSE
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END $$;

-- The one thing anon may call: the shop name for the login screen.
GRANT EXECUTE ON FUNCTION public.public_shop_name() TO anon, authenticated;

-- Objects created later should not be open to anon either.
DO $$
BEGIN
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES    FROM anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
  ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON FUNCTIONS FROM anon;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'default privileges not changed: %', SQLERRM;
END $$;


-- ---------------------------------------------------------------------
-- 5. Storage: the shop logo / QR bucket. Reads of a PUBLIC bucket's files by URL
--    need no policy; uploads and changes are admin-only.
-- ---------------------------------------------------------------------
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE  schemaname = 'storage' AND tablename = 'objects'
      AND  (roles @> '{anon}' OR policyname LIKE '% (authenticated)')
  LOOP
    EXECUTE format('DROP POLICY %I ON storage.objects', pol.policyname);
  END LOOP;

  DROP POLICY IF EXISTS "assets: staff read"   ON storage.objects;
  DROP POLICY IF EXISTS "assets: admin write"  ON storage.objects;
  DROP POLICY IF EXISTS "assets: admin change" ON storage.objects;
  DROP POLICY IF EXISTS "assets: admin delete" ON storage.objects;
  CREATE POLICY "assets: staff read"   ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id = 'assets' AND public.is_staff());
  CREATE POLICY "assets: admin write"  ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'assets' AND public.is_admin());
  CREATE POLICY "assets: admin change" ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id = 'assets' AND public.is_admin()) WITH CHECK (bucket_id = 'assets' AND public.is_admin());
  CREATE POLICY "assets: admin delete" ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id = 'assets' AND public.is_admin());
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'STORAGE POLICIES NOT CHANGED (no privilege). In Dashboard → Storage → Policies, remove the anon policies on bucket "assets" and allow only admins to upload.';
END $$;


-- ---------------------------------------------------------------------
-- 6. Check: what anon can still touch (this should be only public_shop_name)
-- ---------------------------------------------------------------------
SELECT 'table/view anon can still read' AS what, c.relname AS name
FROM   pg_class c
WHERE  c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p', 'v', 'm')
  AND  has_table_privilege('anon', c.oid, 'SELECT')
UNION ALL
SELECT 'function anon can still call', p.oid::regprocedure::text
FROM   pg_proc p
WHERE  p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
  AND  has_function_privilege('anon', p.oid, 'EXECUTE')
UNION ALL
SELECT 'table WITHOUT row level security', c.relname
FROM   pg_class c
WHERE  c.relnamespace = 'public'::regnamespace AND c.relkind IN ('r', 'p') AND NOT c.relrowsecurity;
