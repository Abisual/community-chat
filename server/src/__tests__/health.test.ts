import request from 'supertest';
import app from '../index';

describe('Health Check Endpoint', () => {
  it('should return health status', async () => {
    const response = await request(app)
      .get('/health')
      .expect(200);
    
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('returns JSON errors for malformed and oversized request bodies', async () => {
    await request(app).post('/auth/login').set('Content-Type', 'application/json').send('{').expect(400)
      .expect(({ body }) => expect(body).toEqual({ error: 'Invalid request body' }));
    await request(app).post('/auth/login').send({ padding: 'x'.repeat(17_000) }).expect(413)
      .expect(({ body }) => expect(body).toEqual({ error: 'Request body is too large' }));
  });
});
