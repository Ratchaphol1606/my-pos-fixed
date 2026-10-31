-- =====================================================================
-- ROLLBACK for auth_migration_phase2.sql
-- Puts the database back to "anyone with the public key can read and write", which is
-- how it worked before the login system. Use this only if the app is broken after
-- Phase 2 and you need the shop running NOW; then tell Claude what failed.
-- It does not touch profiles, user_pins or audit_log, and the new login keeps working.
-- =====================================================================

DO $$
DECLARE
  t   record;
  pol record;
BEGIN
  FOR t IN
    SELECT c.relname AS name
    FROM   pg_class c
    WHERE  c.relnamespace = 'public'::regnamespace
      AND  c.relkind IN ('r', 'p')
      AND  c.relname NOT IN ('profiles', 'user_pins', 'audit_log')
      AND  NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t.name LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, t.name);
    END LOOP;
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO anon, authenticated', t.name);
    EXECUTE format('CREATE POLICY "Allow all for anon" ON public.%I FOR ALL TO anon USING (true) WITH CHECK (true)', t.name);
    EXECUTE format('CREATE POLICY "Allow all for authenticated" ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)', t.name);
  END LOOP;
END $$;

-- Views and functions back to open.
DO $$
DECLARE v record; f record;
BEGIN
  FOR v IN SELECT c.relname AS name FROM pg_class c
           WHERE c.relnamespace = 'public'::regnamespace AND c.relkind IN ('v', 'm')
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
  LOOP
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', v.name);
    BEGIN EXECUTE format('ALTER VIEW public.%I SET (security_invoker = false)', v.name);
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END LOOP;

  FOR f IN SELECT p.oid::regprocedure AS sig, p.proname AS name FROM pg_proc p
           WHERE p.pronamespace = 'public'::regnamespace AND p.prokind = 'f'
             AND p.prorettype <> 'trigger'::regtype
             AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = p.oid AND d.deptype = 'e')
  LOOP
    IF f.name <> 'process_refund' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO anon, authenticated', f.sig);
    END IF;   -- process_refund stays server-only, as it always was
  END LOOP;
END $$;

GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Storage: anon may upload to the assets bucket again.
DO $$
BEGIN
  DROP POLICY IF EXISTS "assets: staff read"   ON storage.objects;
  DROP POLICY IF EXISTS "assets: admin write"  ON storage.objects;
  DROP POLICY IF EXISTS "assets: admin change" ON storage.objects;
  DROP POLICY IF EXISTS "assets: admin delete" ON storage.objects;
  CREATE POLICY "assets: open read"   ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'assets');
  CREATE POLICY "assets: open write"  ON storage.objects FOR INSERT TO anon, authenticated WITH CHECK (bucket_id = 'assets');
  CREATE POLICY "assets: open change" ON storage.objects FOR UPDATE TO anon, authenticated USING (bucket_id = 'assets') WITH CHECK (bucket_id = 'assets');
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'Storage policies not changed (no privilege): re-add the assets bucket policies in Dashboard → Storage → Policies.';
END $$;

SELECT 'rolled back: anon can read and write again' AS status;
