INSERT INTO inventory (product_id, quantity_available) VALUES
  ('product-1', 100),
  ('product-2', 50),
  ('product-3', 25)
ON CONFLICT (product_id) DO NOTHING;