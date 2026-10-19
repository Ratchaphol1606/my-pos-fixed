-- Printer settings (run once in the Supabase SQL editor)
-- print_mode: 'server' = send to a print server (e.g. Raspberry Pi), 'browser' = window.print()
-- print_server_url: base URL of the print server, no trailing slash (e.g. https://print.example.com)
-- paper_width_mm: 58 or 80

ALTER TABLE settings ADD COLUMN IF NOT EXISTS print_mode TEXT DEFAULT 'server';
ALTER TABLE settings ADD COLUMN IF NOT EXISTS print_server_url TEXT;
ALTER TABLE settings ADD COLUMN IF NOT EXISTS paper_width_mm INT DEFAULT 58;

ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_print_mode_check;
ALTER TABLE settings ADD CONSTRAINT settings_print_mode_check CHECK (print_mode IN ('server', 'browser'));

ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_paper_width_check;
ALTER TABLE settings ADD CONSTRAINT settings_paper_width_check CHECK (paper_width_mm IN (58, 80));
