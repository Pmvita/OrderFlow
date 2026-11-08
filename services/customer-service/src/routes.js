'use strict';
const express = require('express');
const { z } = require('zod');
const db = require('./db');
const router = express.Router();

const createSchema = z.object({
  email: z.string().email(),
  fullName: z.string().min(1),
});

router.get('/api/customers', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, email, full_name, created_at FROM customers ORDER BY created_at DESC LIMIT 100');
    res.json(rows.map(r => ({ id: r.id, email: r.email, fullName: r.full_name, createdAt: r.created_at })));
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/api/customers/:id', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT id, email, full_name, created_at FROM customers WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'not found' });
    const r = rows[0];
    res.json({ id: r.id, email: r.email, fullName: r.full_name, createdAt: r.created_at });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/api/customers', async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
  try {
    const { rows } = await db.query(
      'INSERT INTO customers (email, full_name) VALUES ($1, $2) RETURNING id, email, full_name, created_at',
      [parsed.data.email, parsed.data.fullName]
    );
    const r = rows[0];
    res.status(201).json({ id: r.id, email: r.email, fullName: r.full_name, createdAt: r.created_at });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'email already exists' });
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;