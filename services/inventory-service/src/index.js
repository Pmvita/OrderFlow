'use strict';

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const cors = require('cors');
const db = require('./db');
const routes = require('./routes');

const app = express();
const PORT = process.env.SERVICE_PORT || 3000;

app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json());

app.get('/healthz/live', (req, res) => res.status(200).json({ status: 'alive' }));
app.get('/healthz/ready', async (req, res) => {
  const ready = await db.isReady();
  if (ready) return res.status(200).json({ status: 'ready' });
  res.status(503).json({ status: 'not ready' });
});

app.use(routes);

module.exports = app;

if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`inventory-service listening on ${PORT}`);
  });

  async function shutdown() {
    server.close(async () => {
      await db.close();
      process.exit(0);
    });
  }
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}
