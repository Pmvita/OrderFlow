'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('./db');
const router = express.Router();

const triggerSchema = z.object({
  orderId: z.string().min(1),
  status: z.enum(['pending', 'confirmed', 'shipped', 'cancelled']),
  recipient: z.string().optional(),
  message: z.string().optional(),
});

router.post('/api/notifications', async (req, res) => {
  const parsed = triggerSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const { rows } = await db.query(
      'INSERT INTO notifications (order_id, status, recipient, message) VALUES ($1,$2,$3,$4) RETURNING id, order_id, status, recipient, message, created_at',
      [parsed.data.orderId, parsed.data.status, parsed.data.recipient || null, parsed.data.message || null]
    );
    const r = rows[0];
    console.log(`[notify] order=${r.order_id} status=${r.status}`);
    res.status(201).json({ id: r.id, orderId: r.order_id, status: r.status, recipient: r.recipient, message: r.message, createdAt: r.created_at });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/notifications', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, order_id, status, recipient, message, created_at FROM notifications ORDER BY created_at DESC LIMIT 100');
    res.json(rows.map(r => ({ id: r.id, orderId: r.order_id, status: r.status, recipient: r.recipient, message: r.message, createdAt: r.created_at })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;