import { pool } from '../database/connection';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'crypto';

export class AuthService {
  static async register(username: string, password: string): Promise<{ user: any; accessToken: string; refreshToken: string }> {
    // Hash the password
    const passwordHash = await argon2.hash(password, { type: argon2.argon2id });

    try {
      // Create user in database
      const query = `
        INSERT INTO users (username, password_hash)
        VALUES ($1, $2)
        RETURNING id, username, created_at
      `;
      const result = await pool.query(query, [username, passwordHash]);
      const user = result.rows[0];

      // Generate tokens
      const accessToken = this.generateAccessToken(user.id, user.username);
      const refreshToken = this.generateRefreshToken();

      // Store refresh token hash in sessions table
      const refreshTokenHash = this.hashRefreshToken(refreshToken);
      const sessionQuery = `
        INSERT INTO sessions (user_id, refresh_token_hash, expires_at)
        VALUES ($1, $2, $3)
        RETURNING id
      `;
      const sessionResult = await pool.query(sessionQuery, [user.id, refreshTokenHash, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]);

      return {
        user: {
          id: user.id,
          username: user.username,
          password_hash: '', // Don't expose password hash
          created_at: user.created_at,
          updated_at: new Date()
        },
        accessToken,
        refreshToken
      };
    } catch (error: any) {
      if (error.code === '23505') { // Unique violation error code for PostgreSQL
        throw new Error('Username already exists');
      }
      throw error;
    }
  }

  static async login(username: string, password: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Find user by username
    const query = 'SELECT id, username, password_hash FROM users WHERE username = $1';
    const result = await pool.query(query, [username]);
    
    if (result.rows.length === 0) {
      throw new Error('Invalid credentials');
    }

    const user = result.rows[0];

    // Verify password
    const isValidPassword = await argon2.verify(user.password_hash, password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    // Generate tokens
    const accessToken = this.generateAccessToken(user.id, user.username);
    const refreshToken = this.generateRefreshToken();

    // Store refresh token hash in sessions table
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const sessionQuery = `
      INSERT INTO sessions (user_id, refresh_token_hash, expires_at)
      VALUES ($1, $2, $3)
      RETURNING id
    `;
    await pool.query(sessionQuery, [user.id, refreshTokenHash, new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)]);

    return {
      accessToken,
      refreshToken
    };
  }

  static async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string }> {
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    const newRefreshToken = this.generateRefreshToken();
    const newRefreshTokenHash = this.hashRefreshToken(newRefreshToken);
    const now = new Date();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    // A single statement makes revocation and replacement atomic, and only one
    // concurrent request can consume the old refresh token.
    const rotateQuery = `
      WITH revoked AS (
        DELETE FROM sessions
        WHERE refresh_token_hash = $1 AND expires_at > $2
        RETURNING user_id
      ), replacement AS (
        INSERT INTO sessions (user_id, refresh_token_hash, expires_at)
        SELECT user_id, $3, $4 FROM revoked
        RETURNING user_id
      )
      SELECT replacement.user_id, users.username
      FROM replacement
      JOIN users ON users.id = replacement.user_id
    `;
    const result = await pool.query(rotateQuery, [refreshTokenHash, now, newRefreshTokenHash, expiresAt]);

    if (result.rows.length === 0) {
      throw new Error('Invalid or expired refresh token');
    }

    return {
      accessToken: this.generateAccessToken(result.rows[0].user_id, result.rows[0].username),
      refreshToken: newRefreshToken
    };
  }

  static async logout(refreshToken: string): Promise<void> {
    // Revoke refresh token by deleting the session
    const refreshTokenHash = this.hashRefreshToken(refreshToken);
    
    const deleteQuery = 'DELETE FROM sessions WHERE refresh_token_hash = $1';
    await pool.query(deleteQuery, [refreshTokenHash]);
  }

  static generateAccessToken(userId: number, username: string): string {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    
    return jwt.sign(
      { userId, username },
      process.env.JWT_SECRET,
      { expiresIn: '15m' } // 15 minutes expiration
    );
  }

  static generateRefreshToken(): string {
    // Generate a cryptographically secure random refresh token
    return randomBytes(32).toString('hex');
  }
  
  static hashRefreshToken(refreshToken: string): string {
    // Use SHA-256 to create a deterministic hash for the refresh token
    return createHash('sha256').update(refreshToken).digest('hex');
  }

  static validateAccessToken(token: string): { userId: number; username: string } {
    if (!process.env.JWT_SECRET) {
      throw new Error('JWT_SECRET environment variable is not set');
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET) as { userId: number; username: string };
      return decoded;
    } catch (error) {
      throw new Error('Invalid access token');
    }
  }

  static async validateRefreshToken(refreshToken: string): Promise<boolean> {
    try {
      const refreshTokenHash = this.hashRefreshToken(refreshToken);
      const sessionQuery = `
        SELECT id FROM sessions WHERE refresh_token_hash = $1 AND expires_at > $2
      `;
      const result = await pool.query(sessionQuery, [refreshTokenHash, new Date()]);
      
      return result.rows.length > 0;
    } catch (error) {
      return false;
    }
  }
}
