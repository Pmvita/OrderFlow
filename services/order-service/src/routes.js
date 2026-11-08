'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('./db');

const router = express.Router();

const itemSchema = z.object({
  productId: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

const createSchema = z.object({
  customerId: z.string().uuid().optional().or(z.string().min(1)),
  items: z.array(itemSchema).min(1),
});

const INVENTORY_URL = process.env.INVENTORY_SERVICE_URL || 'http://inventory-service:3000';
const NOTIFICATION_URL = process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3000';

async function checkInventory(productId, quantity) {
  const r = await fetch(
    `${INVENTORY_URL}/internal/inventory/check?productId=${encodeURIComponent(productId)}&quantity=${quantity}`
  );
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const err = new Error('inventory check failed');
    err.status = 409;
    err.detail = body;
    throw err;
  }
  const data = await r.json();
  if (!data.available) {
    const err = new Error('insufficient stock');
    err.status = 409;
    err.detail = data;
    throw err;
  }
  return data;
}

async function adjustInventory(productId, delta) {
  const r = await fetch(`${INVENTORY_URL}/api/inventory/${encodeURIComponent(productId)}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ delta }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    const err = new Error(body.error || 'inventory adjust failed');
    err.status = r.status === 409 ? 409 : 502;
    err.detail = body;
    throw err;
  }
  return r.json();
}

async function notifyOrder(orderId, status) {
  const r = await fetch(`${NOTIFICATION_URL}/api/notifications`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: String(orderId), status }),
  });
  if (!r.ok) {
    const body = await r.json().catch(() => ({}));
    throw new Error(`notification failed: ${r.status} ${JSON.stringify(body)}`);
  }
  return r.json();
}

router.get('/api/orders', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT id, customer_id, status, total_amount, created_at FROM orders ORDER BY created_at DESC LIMIT 100'
    );
    res.json(
      rows.map((r) => ({
        id: r.id,
        customerId: r.customer_id,
        status: r.status,
        totalAmount: Number(r.total_amount),
        createdAt: r.created_at,
      }))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/api/orders/:id', async (req, res) => {
  try {
    const { rows: o } = await db.query(
      'SELECT id, customer_id, status, total_amount, created_at FROM orders WHERE id = $1',
      [req.params.id]
    );
    if (o.length === 0) return res.status(404).json({ error: 'not found' });
    const { rows: items } = await db.query(
      'SELECT id, product_id, quantity, unit_price FROM order_items WHERE order_id = $1',
      [req.params.id]
    );
    const order = o[0];
    res.json({
      id: order.id,
      customerId: order.customer_id,
      status: order.status,
      totalAmount: Number(order.total_amount),
      createdAt: order.created_at,
      items: items.map((i) => ({
        id: i.id,
        productId: i.product_id,
        quantity: i.quantity,
        unitPrice: Number(i.unit_price),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/api/orders', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  const { customerId, items } = parsed.data;

  try {
    for (const it of items) {
      await checkInventory(it.productId, it.quantity);
    }
  } catch (e) {
    if (e.status === 409) {
      return res.status(409).json({ error: e.message, detail: e.detail });
    }
    return res.status(502).json({ error: 'inventory service unreachable', detail: e.message });
  }

  const total = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const client = await db.pool.connect();
  const decremented = [];

  try {
    await client.query('BEGIN');
    const { rows: o } = await client.query(
      'INSERT INTO orders (customer_id, status, total_amount) VALUES ($1,$2,$3) RETURNING id, customer_id, status, total_amount, created_at',
      [customerId || null, 'confirmed', total]
    );
    const order = o[0];

    for (const it of items) {
      await client.query(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price) VALUES ($1,$2,$3,$4)',
        [order.id, it.productId, it.quantity, it.unitPrice]
      );
      await adjustInventory(it.productId, -it.quantity);
      decremented.push(it);
    }

    await client.query('COMMIT');

    try {
      await notifyOrder(order.id, order.status);
    } catch (notifyErr) {
      console.error(`[order-service] notification failed for order ${order.id}:`, notifyErr.message);
    }

    return res.status(201).json({
      id: order.id,
      customerId: order.customer_id,
      status: order.status,
      totalAmount: Number(order.total_amount),
      createdAt: order.created_at,
    });
  } catch (e) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore rollback errors */
    }

    for (const it of decremented) {
      try {
        await adjustInventory(it.productId, it.quantity);
      } catch (compErr) {
        console.error(
          `[order-service] inventory compensation failed for ${it.productId}:`,
          compErr.message
        );
      }
    }

    const status = e.status === 409 ? 409 : 500;
    return res.status(status).json({ error: e.message, detail: e.detail });
  } finally {
    client.release();
  }
});

module.exports = router;
