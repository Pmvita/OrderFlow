'use strict';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

async function query(text, params) {
  return pool.query(text, params);
}

async function isReady() {
  try {
    await pool.query('SELECT 1');
    return true;
  } catch (e) {
    return false;
  }
}

async function close() {
  await pool.end();
}

module.exports = { pool, query, isReady, close };