#!/bin/bash
set -e
PGUSER="${POSTGRES_USER:-orderflow}"
for db in order_db inventory_db customer_db notification_db; do
  psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d postgres -tc "SELECT 1 FROM pg_database WHERE datname='$db'" | grep -q 1 || \
    psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d postgres -c "CREATE DATABASE $db;"
done

psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d order_db -f /migrations/001_orders.sql
psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d inventory_db -f /migrations/002_inventory.sql
psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d customer_db -f /migrations/003_customers.sql
psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d notification_db -f /migrations/004_notifications.sql

psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d inventory_db -f /migrations/005_seed_inventory.sql
psql -v ON_ERROR_STOP=1 -U "$PGUSER" -d customer_db -f /migrations/006_seed_customers.sql
