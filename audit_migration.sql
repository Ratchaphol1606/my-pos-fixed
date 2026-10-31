-- =====================================================================
-- AUDIT LOG MIGRATION  (additive: safe to run any time after auth_migration_phase1.sql)
-- Run in Supabase → SQL Editor. Idempotent.
--
--   1. audit_log        who did what, when. Only an admin can read it, nobody can edit or
--                       delete rows from the browser. The server (service role) writes
--                       login / refund / promotion / user-management entries.
--   2. Row triggers     products, customers and settings are changed straight from the
--                       browser, so the database records those itself, with the user taken
--                       from the login (auth.uid()).
--
-- Stock and loyalty points change on every sale, so they are NOT logged when the change
-- comes from the sale/refund functions, only when someone edits them by hand on the
-- products / customers pages. That split relies on PostgREST's `request.path` setting.
-- If it is ever missing the triggers simply stay quiet about those two columns; they
-- never get noisier.
--
-- Kill switch for one table:  ALTER TABLE public.products DISABLE TRIGGER audit_products;
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at  timestamptz NOT NULL DEFAULT now(),
  user_id     uuid,                -- no FK on purpose: the log must outlive the account
  username    text,
  role        text,
  action      text NOT NULL,       -- e.g. refund.create, products.update, user.disable
  entity      text,                -- table / thing that was touched
  entity_id   text,
  summary     text,
  old_data    jsonb,
  new_data    jsonb
);

CREATE INDEX IF NOT EXISTS audit_log_created_idx ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_action_idx  ON public.audit_log (action, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_log_user_idx    ON public.audit_log (username, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_log FROM anon, authenticated;
GRANT SELECT ON public.audit_log TO authenticated;

DROP POLICY IF EXISTS "audit: admin reads" ON public.audit_log;
CREATE POLICY "audit: admin reads" ON public.audit_log
  FOR SELECT TO authenticated USING (public.is_admin());


-- ---------------------------------------------------------------------
-- Row-change trigger.  TG_ARGV[0] = comma list of columns that sales change.
-- SECURITY DEFINER so it can write the log and read profiles whatever the caller may do.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_row_change()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  sale_cols text[] := string_to_array(coalesce(TG_ARGV[0], ''), ',');
  skip      text[] := ARRAY['updated_at'];
  uid       uuid   := auth.uid();
  who_user  text;
  who_role  text;
  direct    boolean := coalesce(current_setting('request.path', true), '') = '/' || TG_TABLE_NAME;
  o jsonb; n jsonb; k text;
  old_j jsonb := NULL;
  new_j jsonb := NULL;
  row_j jsonb;
BEGIN
  IF uid IS NOT NULL THEN
    SELECT p.username, p.role INTO who_user, who_role FROM public.profiles p WHERE p.id = uid;
  END IF;

  IF TG_OP = 'INSERT' THEN
    new_j := to_jsonb(NEW) - skip;
    row_j := new_j;
  ELSIF TG_OP = 'DELETE' THEN
    old_j := to_jsonb(OLD) - skip;
    row_j := old_j;
  ELSE
    -- Sale-driven columns only count when edited by hand through the table itself.
    IF NOT direct THEN skip := skip || sale_cols; END IF;
    o := to_jsonb(OLD) - skip;
    n := to_jsonb(NEW) - skip;
    old_j := '{}'::jsonb;
    new_j := '{}'::jsonb;
    FOR k IN SELECT jsonb_object_keys(n) LOOP
      IF o -> k IS DISTINCT FROM n -> k THEN
        old_j := old_j || jsonb_build_object(k, o -> k);
        new_j := new_j || jsonb_build_object(k, n -> k);
      END IF;
    END LOOP;
    IF new_j = '{}'::jsonb THEN RETURN NULL; END IF;   -- nothing worth logging
    row_j := to_jsonb(NEW);
  END IF;

  INSERT INTO public.audit_log (user_id, username, role, action, entity, entity_id, summary, old_data, new_data)
  VALUES (
    uid,
    coalesce(who_user, 'system'),
    who_role,
    TG_TABLE_NAME || '.' || lower(TG_OP),
    TG_TABLE_NAME,
    row_j ->> 'id',
    left(coalesce(row_j ->> 'name', row_j ->> 'shop_name', row_j ->> 'id', ''), 120),
    old_j,
    new_j
  );
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_row_change() FROM PUBLIC, anon, authenticated;


-- ---------------------------------------------------------------------
-- Attach to the tables the browser edits directly.
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.products') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS audit_products ON public.products;
    CREATE TRIGGER audit_products AFTER INSERT OR UPDATE OR DELETE ON public.products
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('stock');
  END IF;

  IF to_regclass('public.customers') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS audit_customers ON public.customers;
    CREATE TRIGGER audit_customers AFTER INSERT OR UPDATE OR DELETE ON public.customers
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('current_points,total_spent');
  END IF;

  IF to_regclass('public.settings') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS audit_settings ON public.settings;
    CREATE TRIGGER audit_settings AFTER INSERT OR UPDATE OR DELETE ON public.settings
      FOR EACH ROW EXECUTE FUNCTION public.audit_row_change('');
  END IF;
END $$;

SELECT tgname, tgrelid::regclass AS "table", tgenabled FROM pg_trigger WHERE tgname LIKE 'audit\_%' ORDER BY 1;
