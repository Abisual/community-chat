/* 
 * Migration script to create messages table
 * This migration creates the chat messages table for message history
 */

export const up = async (pool: any) => {
  const query = `
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      room_id INTEGER NOT NULL REFERENCES voice_rooms(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  await pool.query(query);
  console.log('Messages table created successfully');
};

export const down = async (pool: any) => {
  const query = 'DROP TABLE IF EXISTS messages;';
  await pool.query(query);
  console.log('Messages table dropped successfully');
};