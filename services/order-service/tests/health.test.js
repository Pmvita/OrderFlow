const request = require('supertest');
const app = require('../src/index');

describe('order-service', () => {
  it('liveness probe returns 200', async () => {
    const res = await request(app).get('/healthz/live');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('alive');
  });
});
