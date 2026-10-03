/* Global text chat history, separate from voice-room membership. */
export const up = async (pool: any) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS chat_messages (
      id BIGSERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content VARCHAR(2000) NOT NULL CHECK (length(trim(content)) > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS chat_messages_created_at_idx
    ON chat_messages (created_at DESC, id DESC);
  `);
};

export const down = async (pool: any) => {
  await pool.query('DROP TABLE IF EXISTS chat_messages;');
};
