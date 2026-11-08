#!/usr/bin/env bash
# End-to-end smoke test against docker-compose stack.
# Usage: docker compose up -d --build && ./scripts/e2e-compose.sh
set -euo pipefail

ORDER_URL="${ORDER_URL:-http://localhost:3001}"
INVENTORY_URL="${INVENTORY_URL:-http://localhost:3002}"
CUSTOMER_URL="${CUSTOMER_URL:-http://localhost:3003}"
NOTIFICATION_URL="${NOTIFICATION_URL:-http://localhost:3004}"
MAX_WAIT="${MAX_WAIT:-90}"

wait_ready() {
  local name="$1" url="$2"
  local i=0
  echo "Waiting for $name..."
  until curl -sf "$url/healthz/ready" >/dev/null 2>&1; do
    i=$((i + 1))
    if [ "$i" -ge "$MAX_WAIT" ]; then
      echo "ERROR: $name not ready after ${MAX_WAIT}s" >&2
      exit 1
    fi
    sleep 1
  done
  echo "  $name ready"
}

wait_ready order-service "$ORDER_URL"
wait_ready inventory-service "$INVENTORY_URL"
wait_ready customer-service "$CUSTOMER_URL"
wait_ready notification-service "$NOTIFICATION_URL"

echo "Creating customer..."
CUSTOMER_JSON=$(curl -sf -X POST "$CUSTOMER_URL/api/customers" \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"e2e-$(date +%s)@example.com\",\"fullName\":\"E2E User\"}")
CUSTOMER_ID=$(printf '%s' "$CUSTOMER_JSON" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
test -n "$CUSTOMER_ID"
echo "  customer=$CUSTOMER_ID"

echo "Checking inventory for product-1..."
INV_BEFORE=$(curl -sf "$INVENTORY_URL/api/inventory/product-1")
QTY_BEFORE=$(printf '%s' "$INV_BEFORE" | sed -n 's/.*"quantityAvailable":\([0-9]*\).*/\1/p')
echo "  quantityAvailable=$QTY_BEFORE"

echo "Placing order..."
ORDER_JSON=$(curl -sf -X POST "$ORDER_URL/api/orders" \
  -H 'Content-Type: application/json' \
  -d "{\"customerId\":\"$CUSTOMER_ID\",\"items\":[{\"productId\":\"product-1\",\"quantity\":1,\"unitPrice\":9.99}]}")
ORDER_ID=$(printf '%s' "$ORDER_JSON" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
test -n "$ORDER_ID"
echo "  order=$ORDER_ID"

echo "Verifying inventory decremented..."
INV_AFTER=$(curl -sf "$INVENTORY_URL/api/inventory/product-1")
QTY_AFTER=$(printf '%s' "$INV_AFTER" | sed -n 's/.*"quantityAvailable":\([0-9]*\).*/\1/p')
EXPECTED=$((QTY_BEFORE - 1))
if [ "$QTY_AFTER" != "$EXPECTED" ]; then
  echo "ERROR: expected quantity $EXPECTED, got $QTY_AFTER" >&2
  exit 1
fi

echo "Verifying notification recorded..."
NOTIFS=$(curl -sf "$NOTIFICATION_URL/api/notifications")
printf '%s' "$NOTIFS" | grep -q "$ORDER_ID"

echo "Verifying insufficient stock returns 409..."
HTTP=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$ORDER_URL/api/orders" \
  -H 'Content-Type: application/json' \
  -d "{\"customerId\":\"$CUSTOMER_ID\",\"items\":[{\"productId\":\"product-1\",\"quantity\":999999,\"unitPrice\":1}]}")
if [ "$HTTP" != "409" ]; then
  echo "ERROR: expected 409, got $HTTP" >&2
  exit 1
fi

echo "E2E compose checks passed."
