
-- 1. สร้างตาราง Settings สำหรับเก็บข้อมูลร้านและค่าคอนฟิก
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  shop_name TEXT DEFAULT 'บุญชอบเครื่องครัว สามแยก',
  shop_address TEXT DEFAULT '351/3 ม.5 ต.ท่าบุญมี อ.เกาะจันทร์ จ.ชลบุรี 20240',
  shop_phone TEXT DEFAULT '065-983-4959',
  promptpay_id TEXT DEFAULT '0659834959',
  qr_code_url TEXT, -- สำหรับเก็บ Link รูปภาพ QR Code ที่อัปโหลด
  low_stock_threshold INT DEFAULT 5,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT one_row CHECK (id = 1) -- ล็อคให้มีได้แค่แถวเดียว
);

-- 2. ใส่ข้อมูลเริ่มต้น
INSERT INTO settings (id) VALUES (1) 
ON CONFLICT (id) DO NOTHING;

-- 3. เพิ่มคอลัมน์ payment_method ในตาราง sales (ถ้ายังไม่มี)
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS payment_method TEXT DEFAULT 'cash';
-- ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount NUMERIC DEFAULT 0;
