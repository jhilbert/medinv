ALTER TABLE medications ADD COLUMN barcode_code TEXT;
ALTER TABLE medications ADD COLUMN gtin TEXT;
ALTER TABLE medications ADD COLUMN lot_number TEXT;
ALTER TABLE medications ADD COLUMN serial_number TEXT;
ALTER TABLE medications ADD COLUMN barcode_format TEXT;

CREATE INDEX IF NOT EXISTS idx_medications_barcode_code
ON medications (barcode_code);

CREATE INDEX IF NOT EXISTS idx_medications_gtin
ON medications (gtin);

CREATE TABLE IF NOT EXISTS barcode_catalog (
  code TEXT PRIMARY KEY,
  gtin TEXT,
  name TEXT NOT NULL,
  manufacturer TEXT NOT NULL,
  active_ingredient TEXT NOT NULL,
  last_seen_expiry_date TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_barcode_catalog_gtin
ON barcode_catalog (gtin);

