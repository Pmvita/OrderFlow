'use strict';

jest.mock('../src/db', () => ({
  query: jest.fn(),
  isReady: jest.fn(async () => true),
  close: jest.fn(async () => {}),
  pool: {},
}));

const request = require('supertest');
const db = require('../src/db');
const app = require('../src/index');

describe('inventory-service adjust', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('decrements stock with delta', async () => {
    db.query
      .mockResolvedValueOnce({ rows: [{ quantity_available: 10 }] })
      .mockResolvedValueOnce({
        rows: [
          {
            product_id: 'product-1',
            quantity_available: 7,
            updated_at: '2026-01-01T00:00:00.000Z',
          },
        ],
      });

    const res = await request(app).patch('/api/inventory/product-1').send({ delta: -3 });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      productId: 'product-1',
      quantityAvailable: 7,
    });
    expect(db.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE inventory'),
      [7, 'product-1']
    );
  });

  it('returns 409 when delta would go negative', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ quantity_available: 2 }] });

    const res = await request(app).patch('/api/inventory/product-1').send({ delta: -5 });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('insufficient stock');
  });

  it('checks availability via internal endpoint', async () => {
    db.query.mockResolvedValueOnce({ rows: [{ quantity_available: 4 }] });

    const res = await request(app).get(
      '/internal/inventory/check?productId=product-1&quantity=3'
    );

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      productId: 'product-1',
      requested: 3,
      available: true,
      quantityAvailable: 4,
    });
  });
});
