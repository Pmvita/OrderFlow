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

describe('notification-service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('records an order status notification', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'n1',
          order_id: 'ord-1',
          status: 'confirmed',
          recipient: null,
          message: null,
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const res = await request(app)
      .post('/api/notifications')
      .send({ orderId: 'ord-1', status: 'confirmed' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'n1',
      orderId: 'ord-1',
      status: 'confirmed',
    });
  });
});
