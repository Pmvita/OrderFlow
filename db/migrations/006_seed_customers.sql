INSERT INTO customers (id, email, full_name) VALUES
  ('11111111-1111-1111-1111-111111111111', 'alice@example.com', 'Alice Anderson'),
  ('22222222-2222-2222-2222-222222222222', 'bob@example.com', 'Bob Brown')
ON CONFLICT (email) DO NOTHING;