-- Wholesale price tiers (ราคาส่ง): buy N+ of the same product, pay a lower unit price.
-- Run once in the Supabase SQL editor. Safe to re-run.
--
-- Same access model as `promotions`: every logged-in staff member can READ
-- (the checkout needs it); writes go through /api/price-tiers (admin + PIN
-- unlock, service role), so there is deliberately no write policy here.

CREATE TABLE IF NOT EXISTS public.product_price_tiers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  TEXT NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  min_qty     INTEGER NOT NULL CHECK (min_qty >= 2),
  unit_price  NUMERIC(12, 2) NOT NULL CHECK (unit_price >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, min_qty)
);

CREATE INDEX IF NOT EXISTS idx_price_tiers_product ON public.product_price_tiers (product_id);

ALTER TABLE public.product_price_tiers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff read" ON public.product_price_tiers;
CREATE POLICY "staff read" ON public.product_price_tiers
  FOR SELECT TO authenticated USING (public.is_staff());
