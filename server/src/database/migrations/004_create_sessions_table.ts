/* 
 * Migration script to create sessions table
 * This migration creates the sessions table for token management (refresh tokens)
 */

export const up = async (pool: any) => {
  const query = `
    CREATE TABLE IF NOT EXISTS sessions (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token_hash VARCHAR(255) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  await pool.query(query);
  console.log('Sessions table created successfully');
};

export const down = async (pool: any) => {
  const query = 'DROP TABLE IF EXISTS sessions;';
  await pool.query(query);
  console.log('Sessions table dropped successfully');
};