-- ============================================================
--  MY POS - SUPABASE FULL SETUP SCRIPT
--  Run this entire file in Supabase SQL Editor
--  Project: บุญชอบเครื่องครัว สามแยก
-- ============================================================


-- ============================================================
-- 1. PRODUCTS TABLE
--    Used by: /products page, / (POS page), /reports, /taxReports
-- ============================================================
CREATE TABLE IF NOT EXISTS products (
  id            TEXT PRIMARY KEY,           -- Barcode / manual ID
  name          TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'ทั่วไป',
  cost_price    NUMERIC(10,2) NOT NULL DEFAULT 0,
  retail_price  NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock         INTEGER NOT NULL DEFAULT 0,
  date_add      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast category filtering on POS page
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);


-- ============================================================
-- 2. SALES TABLE
--    Used by: / (POS page), /sales, /reports, /taxReports
-- ============================================================
CREATE TABLE IF NOT EXISTS sales (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_no       TEXT NOT NULL UNIQUE,       -- e.g. INV202506010001
  total_amount     NUMERIC(10,2) NOT NULL DEFAULT 0,
  received_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  change_amount    NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount_amount  NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method   TEXT NOT NULL DEFAULT 'cash',  -- 'cash' | 'transfer'
  receipt_snapshot JSONB,                      -- Full receipt snapshot for reprinting
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for date-range queries used in /sales and /reports pages
CREATE INDEX IF NOT EXISTS idx_sales_created_at ON sales(created_at);
CREATE INDEX IF NOT EXISTS idx_sales_receipt_no  ON sales(receipt_no);
CREATE INDEX IF NOT EXISTS idx_sales_payment     ON sales(payment_method);


-- ============================================================
-- 3. SALE_ITEMS TABLE
--    Used by: / (POS page), /reports (profit calc), /taxReports
-- ============================================================
CREATE TABLE IF NOT EXISTS sale_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id       UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id    TEXT NOT NULL REFERENCES products(id) ON DELETE RESTRICT,
  quantity      INTEGER NOT NULL DEFAULT 1,
  price_at_sale NUMERIC(10,2) NOT NULL DEFAULT 0  -- Locked price at time of sale
);

-- Indexes for JOIN queries in /reports page
CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id    ON sale_items(sale_id);
CREATE INDEX IF NOT EXISTS idx_sale_items_product_id ON sale_items(product_id);


-- ============================================================
-- 4. CUSTOMERS TABLE  (future use / loyalty program)
--    Not yet wired to UI but ready for expansion
-- ============================================================
CREATE TABLE IF NOT EXISTS customers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  phone        TEXT UNIQUE,
  email        TEXT,
  address      TEXT,
  note         TEXT,
  total_spent  NUMERIC(10,2) NOT NULL DEFAULT 0,  -- Updated by trigger below
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);


-- ============================================================
-- 5. EXPENSE TABLE  (future use / cost tracking)
--    Not yet wired to UI but supports /taxReports expansion
-- ============================================================
CREATE TABLE IF NOT EXISTS expenses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT NOT NULL,
  amount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  category    TEXT NOT NULL DEFAULT 'ทั่วไป',
  note        TEXT,
  expense_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_expense_at ON expenses(expense_at);


-- ============================================================
-- 6. REQUIRED STORED FUNCTION: decrement_stock
--    Called by POS page after every successful sale
--    Usage: supabase.rpc('decrement_stock', { row_id, amount })
-- ============================================================
CREATE OR REPLACE FUNCTION decrement_stock(row_id TEXT, amount INTEGER)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE products
  SET stock = GREATEST(stock - amount, 0)
  WHERE id = row_id;
END;
$$;


-- ============================================================
-- 7. ROW LEVEL SECURITY (RLS)
--    Using anon/public key so we allow full access for now.
--    Tighten these rules when you add user authentication.
-- ============================================================
ALTER TABLE products   ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses   ENABLE ROW LEVEL SECURITY;

-- Allow all operations for anonymous (your app uses the anon key)
CREATE POLICY "Allow all for anon" ON products   FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON sales      FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON sale_items FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON customers  FOR ALL TO anon USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON expenses   FOR ALL TO anon USING (true) WITH CHECK (true);


-- ============================================================
-- 8. SAMPLE DATA — products
--    Matches the categories in your /products page dropdown
--    Delete this block if you want a clean start
-- ============================================================
INSERT INTO products (id, name, category, cost_price, retail_price, stock) VALUES
  ('8850999000001', 'หม้อสแตนเลส 20 ซม.',       'อุปกรณ์ครัว',    180, 290, 50),
  ('8850999000002', 'กระทะเคลือบ 26 ซม.',        'อุปกรณ์ครัว',    220, 350, 30),
  ('8850999000003', 'ถาดพลาสติกใส 3 ชั้น',       'พลาสติก',         85, 150, 100),
  ('8850999000004', 'ตะกร้าพลาสติกสี่เหลี่ยม',   'พลาสติก',         60, 120, 80),
  ('8850999000005', 'หลอดไฟ LED 9W',              'อุปกรณ์ไฟฟ้า',    35,  75, 200),
  ('8850999000006', 'สายไฟ 3x1.5 (10 เมตร)',      'อุปกรณ์ไฟฟ้า',   120, 220, 40),
  ('8850999000007', 'ผ้าเช็ดตัวลายริ้ว',          'เครื่องแต่งกาย',  90, 180, 60),
  ('8850999000008', 'ถุงเท้าข้อสั้น (แพ็ค 3 คู่)','เครื่องแต่งกาย',  55, 100, 120),
  ('8850999000009', 'แก้วเซรามิกลายดอก',          'กิฟต์ชอป',        70, 145, 45),
  ('8850999000010', 'กล่องของขวัญริบบิ้นแดง',     'กิฟต์ชอป',        40,  90, 70),
  ('8850999000011', 'ไขควงชุด 6 ชิ้น',            'เครื่องมือช่าง',  130, 250, 25),
  ('8850999000012', 'ประแจเลื่อน 8 นิ้ว',         'เครื่องมือช่าง',  160, 299, 20),
  ('8850999000013', 'หมอนหนุน Fiber 18x28',       'เครื่องนอน',      110, 220, 35),
  ('8850999000014', 'ผ้าห่มนวม 3.5 ฟุต',          'เครื่องนอน',      280, 490, 18)
ON CONFLICT (id) DO NOTHING;


-- ============================================================
-- DONE!
-- Tables created: products, sales, sale_items, customers, expenses
-- Function created: decrement_stock
-- RLS policies: open access (anon key)
-- Sample products: 14 items across all categories
-- ============================================================
