/* 
 * Migration script to create users table
 * This migration creates the core users table for authentication
 */

export const up = async (pool: any) => {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  await pool.query(query);
  console.log('Users table created successfully');
};

export const down = async (pool: any) => {
  const query = 'DROP TABLE IF EXISTS users;';
  await pool.query(query);
  console.log('Users table dropped successfully');
};