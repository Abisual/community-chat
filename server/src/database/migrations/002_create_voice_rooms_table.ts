/* 
 * Migration script to create voice rooms table
 * This migration creates the voice rooms table for predefined public rooms
 */

export const up = async (pool: any) => {
  const query = `
    CREATE TABLE IF NOT EXISTS voice_rooms (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) UNIQUE NOT NULL,
      description TEXT,
      max_participants INTEGER DEFAULT 10,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  await pool.query(query);
  console.log('Voice rooms table created successfully');
  
  // Insert default voice rooms (predefined public rooms)
  const insertQuery = `
    INSERT INTO voice_rooms (name, description, max_participants) 
    VALUES 
      ('General Chat', 'Main community discussion room', 20),
      ('Tech Talk', 'Technology and development discussions', 15),
      ('Gaming Zone', 'Gaming related conversations', 25)
    ON CONFLICT (name) DO NOTHING;
  `;
  
  await pool.query(insertQuery);
  console.log('Default voice rooms inserted successfully');
};

export const down = async (pool: any) => {
  const query = 'DROP TABLE IF EXISTS voice_rooms;';
  await pool.query(query);
  console.log('Voice rooms table dropped successfully');
};