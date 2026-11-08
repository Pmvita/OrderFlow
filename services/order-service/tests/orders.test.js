'use strict';

const mockClient = {
  query: jest.fn(),
  release: jest.fn(),
};

jest.mock('../src/db', () => ({
  pool: {
    connect: jest.fn(() => Promise.resolve(mockClient)),
  },
  query: jest.fn(),
  isReady: jest.fn(async () => true),
  close: jest.fn(async () => {}),
}));

const request = require('supertest');
const app = require('../src/index');

function jsonResponse(status, body) {
  return Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

describe('order-service create order', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    mockClient.query.mockReset();
    mockClient.release.mockReset();
  });

  it('creates order when inventory is available and notifies', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse(200, { available: true, quantityAvailable: 10 }))
      .mockResolvedValueOnce(jsonResponse(200, { productId: 'product-1', quantityAvailable: 9 }))
      .mockResolvedValueOnce(jsonResponse(201, { id: 'n1', orderId: 'ord-1', status: 'confirmed' }));

    const createdAt = new Date().toISOString();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'ord-1',
            customer_id: 'cust-1',
            status: 'confirmed',
            total_amount: '19.99',
            created_at: createdAt,
          },
        ],
      })
      .mockResolvedValueOnce({}) // INSERT order_items
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'cust-1',
        items: [{ productId: 'product-1', quantity: 1, unitPrice: 19.99 }],
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: 'ord-1',
      customerId: 'cust-1',
      status: 'confirmed',
      totalAmount: 19.99,
    });

    expect(global.fetch).toHaveBeenCalledTimes(3);
    expect(global.fetch.mock.calls[0][0]).toContain('/internal/inventory/check');
    expect(global.fetch.mock.calls[1][0]).toContain('/api/inventory/product-1');
    expect(global.fetch.mock.calls[1][1]).toMatchObject({
      method: 'PATCH',
      body: JSON.stringify({ delta: -1 }),
    });
    expect(global.fetch.mock.calls[2][0]).toContain('/api/notifications');
    expect(JSON.parse(global.fetch.mock.calls[2][1].body)).toEqual({
      orderId: 'ord-1',
      status: 'confirmed',
    });
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(mockClient.release).toHaveBeenCalled();
  });

  it('returns 409 when stock is insufficient', async () => {
    global.fetch.mockResolvedValueOnce(
      jsonResponse(200, {
        available: false,
        productId: 'product-1',
        requested: 5,
        quantityAvailable: 1,
      })
    );

    const res = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'cust-1',
        items: [{ productId: 'product-1', quantity: 5, unitPrice: 10 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toBe('insufficient stock');
    expect(mockClient.query).not.toHaveBeenCalled();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('rolls back when inventory decrement fails', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse(200, { available: true, quantityAvailable: 10 }))
      .mockResolvedValueOnce(jsonResponse(409, { error: 'insufficient stock' }));

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'ord-2',
            customer_id: 'cust-1',
            status: 'confirmed',
            total_amount: '10',
            created_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({}) // INSERT items
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'cust-1',
        items: [{ productId: 'product-1', quantity: 1, unitPrice: 10 }],
      });

    expect(res.status).toBe(409);
    expect(res.body.error).toMatch(/insufficient stock|inventory adjust failed/i);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    expect(global.fetch.mock.calls.some((c) => String(c[0]).includes('/api/notifications'))).toBe(
      false
    );
  });

  it('still returns 201 when notification fails after commit', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse(200, { available: true, quantityAvailable: 10 }))
      .mockResolvedValueOnce(jsonResponse(200, { productId: 'product-1', quantityAvailable: 9 }))
      .mockResolvedValueOnce(jsonResponse(500, { error: 'notify down' }));

    const createdAt = new Date().toISOString();
    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'ord-3',
            customer_id: 'cust-1',
            status: 'confirmed',
            total_amount: '10',
            created_at: createdAt,
          },
        ],
      })
      .mockResolvedValueOnce({}) // INSERT items
      .mockResolvedValueOnce({}); // COMMIT

    const res = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'cust-1',
        items: [{ productId: 'product-1', quantity: 1, unitPrice: 10 }],
      });

    expect(res.status).toBe(201);
    expect(res.body.id).toBe('ord-3');
    expect(mockClient.query).toHaveBeenCalledWith('COMMIT');
    expect(global.fetch.mock.calls[2][0]).toContain('/api/notifications');
  });

  it('compensates prior decrements when a later item fails', async () => {
    global.fetch
      .mockResolvedValueOnce(jsonResponse(200, { available: true, quantityAvailable: 10 })) // check p1
      .mockResolvedValueOnce(jsonResponse(200, { available: true, quantityAvailable: 5 })) // check p2
      .mockResolvedValueOnce(jsonResponse(200, { productId: 'product-1', quantityAvailable: 9 })) // dec p1
      .mockResolvedValueOnce(jsonResponse(409, { error: 'insufficient stock' })) // dec p2 fails
      .mockResolvedValueOnce(jsonResponse(200, { productId: 'product-1', quantityAvailable: 10 })); // compensate p1

    mockClient.query
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [
          {
            id: 'ord-4',
            customer_id: 'cust-1',
            status: 'confirmed',
            total_amount: '30',
            created_at: new Date().toISOString(),
          },
        ],
      })
      .mockResolvedValueOnce({}) // INSERT item 1
      .mockResolvedValueOnce({}) // INSERT item 2
      .mockResolvedValueOnce({}); // ROLLBACK

    const res = await request(app)
      .post('/api/orders')
      .send({
        customerId: 'cust-1',
        items: [
          { productId: 'product-1', quantity: 1, unitPrice: 10 },
          { productId: 'product-2', quantity: 2, unitPrice: 10 },
        ],
      });

    expect(res.status).toBe(409);
    expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
    const patchBodies = global.fetch.mock.calls
      .filter((c) => c[1] && c[1].method === 'PATCH')
      .map((c) => JSON.parse(c[1].body));
    expect(patchBodies).toEqual([{ delta: -1 }, { delta: -2 }, { delta: 1 }]);
    expect(global.fetch.mock.calls.some((c) => String(c[0]).includes('/api/notifications'))).toBe(
      false
    );
  });
});
