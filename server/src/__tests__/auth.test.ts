import request from 'supertest';

jest.mock('../database/connection', () => require('./helpers/mockPool'));

import app from '../index';
import { pool } from '../database/connection';

describe('Authentication', () => {
  // Clean up test data before tests
  beforeEach(async () => {
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM users');
  });

  afterAll(async () => {
    await pool.query('DELETE FROM sessions');
    await pool.query('DELETE FROM users');
    await pool.end();
  });

  describe('POST /auth/register', () => {
    it('should register a new user successfully', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser1',
          password: 'password123'
        })
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('username', 'testuser1');
      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).not.toHaveProperty('password_hash');

      const stored = await pool.query('SELECT password_hash FROM users WHERE username = $1', ['testuser1']);
      expect(stored.rows[0].password_hash.startsWith('$argon2id$')).toBe(true);
    });

    it('should not register with duplicate username', async () => {
      // Create first user
      await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser2',
          password: 'password123'
        })
        .expect(201);

      // Try to create user with same username
      const response = await request(app)
        .post('/auth/register')
        .send({
          username: 'testuser2',
          password: 'password456'
        })
        .expect(409);

      expect(response.body).toHaveProperty('error', 'Username already exists');
    });

    it('should not register with invalid input', async () => {
      const response = await request(app)
        .post('/auth/register')
        .send({
          username: 'ab',
          password: '123'
        })
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject non-string credentials', async () => {
      await request(app)
        .post('/auth/register')
        .send({ username: { value: 'user' }, password: 123456 })
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      // Create a user for login testing
      await request(app)
        .post('/auth/register')
        .send({
          username: 'loginuser',
          password: 'password123'
        })
        .expect(201);
    });

    it('should login successfully with valid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'loginuser',
          password: 'password123'
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
      expect(response.body.user).toEqual({ id: expect.any(Number), username: 'loginuser' });
    });

    it('should not login with invalid credentials', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'loginuser',
          password: 'wrongpassword'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid username or password');
    });

    it('should not login with nonexistent user', async () => {
      const response = await request(app)
        .post('/auth/login')
        .send({
          username: 'nonexistentuser',
          password: 'password123'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid username or password');
    });
  });

  describe('POST /auth/refresh', () => {
    let refreshToken: string;
    
    beforeEach(async () => {
      // Register and login to get a refresh token
      const registerResponse = await request(app)
        .post('/auth/register')
        .send({
          username: 'refreshtestuser',
          password: 'password123'
        })
        .expect(201);

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          username: 'refreshtestuser',
          password: 'password123'
        })
        .expect(200);
        
      refreshToken = loginResponse.body.refreshToken;
    });

    it('should refresh token successfully', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken
        })
        .expect(200);

      expect(response.body).toHaveProperty('accessToken');
    });

    it('should not refresh with invalid token', async () => {
      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: 'invalid-token'
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid or expired refresh token');
    });
    
    it('should rotate refresh token on refresh', async () => {
      // First refresh to get new token
      const response1 = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken
        })
        .expect(200);
        
      const newRefreshToken = response1.body.refreshToken;
      
      // Try using old token - it should fail
      const response2 = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken  // Use the old token
        })
        .expect(401);
      
      expect(response2.body).toHaveProperty('error', 'Invalid or expired refresh token');
      
      // Try using new token - it should work
      const response3 = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken: newRefreshToken  // Use the new token
        })
        .expect(200);
      
      expect(response3.body).toHaveProperty('accessToken');
    });

    it('should allow only one concurrent refresh to consume a token', async () => {
      const responses = await Promise.all([
        request(app).post('/auth/refresh').send({ refreshToken }),
        request(app).post('/auth/refresh').send({ refreshToken })
      ]);

      expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    });
  });

  describe('POST /auth/logout', () => {
    let refreshToken: string;
    
    beforeEach(async () => {
      // Register and login to get a refresh token
      const registerResponse = await request(app)
        .post('/auth/register')
        .send({
          username: 'logouttestuser',
          password: 'password123'
        })
        .expect(201);

      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          username: 'logouttestuser',
          password: 'password123'
        })
        .expect(200);
        
      refreshToken = loginResponse.body.refreshToken;
    });

    it('should logout successfully', async () => {
      const response = await request(app)
        .post('/auth/logout')
        .send({
          refreshToken
        })
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Logged out successfully');
    });

    it('should fail to refresh after logout', async () => {
      // Logout first
      await request(app)
        .post('/auth/logout')
        .send({
          refreshToken
        })
        .expect(200);

      // Try to refresh with the same token - should fail
      const response = await request(app)
        .post('/auth/refresh')
        .send({
          refreshToken
        })
        .expect(401);

      expect(response.body).toHaveProperty('error', 'Invalid or expired refresh token');
    });
    
    it('should not store plaintext refresh tokens in database', async () => {
      // First login to get a token
      const loginResponse = await request(app)
        .post('/auth/login')
        .send({
          username: 'logouttestuser',
          password: 'password123'
        })
        .expect(200);
        
      const refreshToken = loginResponse.body.refreshToken;
      
      // Check the database directly to make sure plaintext token is NOT stored
      const sessionsResult = await pool.query('SELECT * FROM sessions');
      
      // All stored tokens should be SHA-256 hashes (64 characters hexadecimal)
      sessionsResult.rows.forEach(row => {
        expect(row.refresh_token_hash).toHaveLength(64);  // SHA-256 hash is 64 hex characters
        expect(row.refresh_token_hash).toMatch(/^[a-f0-9]{64}$/);  // Valid hex string
        // The token itself should NOT match the plaintext refreshToken because it's hashed
        expect(row.refresh_token_hash).not.toBe(refreshToken);
      });
    });
  });
});
