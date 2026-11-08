'use strict';

const express = require('express');
const { z } = require('zod');
const db = require('./db');

const router = express.Router();

const adjustSchema = z.object({
  delta: z.number().int().optional(),
  quantity: z.number().int().min(0).optional(),
}).refine((d) => d.delta !== undefined || d.quantity !== undefined, {
  message: 'Provide delta or quantity',
});

// GET /api/inventory/:productId
router.get('/api/inventory/:productId', async (req, res) => {
  try {
    const { rows } = await db.query(
      'SELECT product_id, quantity_available, updated_at FROM inventory WHERE product_id = $1',
      [req.params.productId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    const r = rows[0];
    res.json({ productId: r.product_id, quantityAvailable: r.quantity_available, updatedAt: r.updated_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PATCH /api/inventory/:productId
router.patch('/api/inventory/:productId', async (req, res) => {
  const parsed = adjustSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const { rows: cur } = await db.query('SELECT quantity_available FROM inventory WHERE product_id = $1', [req.params.productId]);
    if (cur.length === 0) return res.status(404).json({ error: 'not found' });
    let newQty;
    if (parsed.data.quantity !== undefined) newQty = parsed.data.quantity;
    else newQty = cur[0].quantity_available + parsed.data.delta;
    if (newQty < 0) return res.status(409).json({ error: 'insufficient stock' });
    const { rows } = await db.query(
      'UPDATE inventory SET quantity_available = $1, updated_at = NOW() WHERE product_id = $2 RETURNING product_id, quantity_available, updated_at',
      [newQty, req.params.productId]
    );
    const r = rows[0];
    res.json({ productId: r.product_id, quantityAvailable: r.quantity_available, updatedAt: r.updated_at });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Internal stock check used by order-service
router.get('/internal/inventory/check', async (req, res) => {
  const productId = req.query.productId;
  const qty = parseInt(req.query.quantity || '1', 10);
  if (!productId) return res.status(400).json({ error: 'productId required' });
  try {
    const { rows } = await db.query('SELECT quantity_available FROM inventory WHERE product_id = $1', [productId]);
    if (rows.length === 0) return res.status(404).json({ available: false, reason: 'unknown product' });
    const available = rows[0].quantity_available >= qty;
    res.json({ productId, requested: qty, available, quantityAvailable: rows[0].quantity_available });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;