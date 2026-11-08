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

describe('customer-service uniqueness', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('creates a customer', async () => {
    db.query.mockResolvedValueOnce({
      rows: [
        {
          id: 'c1',
          email: 'alice@example.com',
          full_name: 'Alice',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      ],
    });

    const res = await request(app)
      .post('/api/customers')
      .send({ email: 'alice@example.com', fullName: 'Alice' });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'c1',
      email: 'alice@example.com',
      fullName: 'Alice',
    });
  });

  it('returns 409 when email already exists', async () => {
    const err = new Error('duplicate key');
    err.code = '23505';
    db.query.mockRejectedValueOnce(err);

    const res = await request(app)
      .post('/api/customers')
      .send({ email: 'alice@example.com', fullName: 'Alice' });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('email already exists');
  });
});
