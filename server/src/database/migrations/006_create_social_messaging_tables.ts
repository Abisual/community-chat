export const up = async (pool: any) => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS friendships (
      user_low_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_high_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_low_id, user_high_id),
      CHECK (user_low_id < user_high_id)
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS friendships_user_high_id_idx
    ON friendships (user_high_id, user_low_id);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS friend_requests (
      id SERIAL PRIMARY KEY,
      requester_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      recipient_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status VARCHAR(16) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'accepted', 'rejected')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      responded_at TIMESTAMPTZ,
      CHECK (requester_id <> recipient_id)
    );
  `);
  await pool.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS friend_requests_one_pending_pair_idx
    ON friend_requests (LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id))
    WHERE status = 'pending';
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS friend_requests_recipient_status_idx
    ON friend_requests (recipient_id, status, created_at DESC);
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS direct_conversations (
      id SERIAL PRIMARY KEY,
      user_low_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      user_high_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_low_id, user_high_id),
      CHECK (user_low_id < user_high_id)
    );
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS private_messages (
      id BIGSERIAL PRIMARY KEY,
      conversation_id INTEGER NOT NULL REFERENCES direct_conversations(id) ON DELETE CASCADE,
      sender_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      content VARCHAR(2000) NOT NULL CHECK (length(trim(content)) > 0),
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);
  await pool.query(`
    CREATE INDEX IF NOT EXISTS private_messages_conversation_order_idx
    ON private_messages (conversation_id, id DESC);
  `);
};

export const down = async (pool: any) => {
  await pool.query('DROP TABLE IF EXISTS private_messages;');
  await pool.query('DROP TABLE IF EXISTS direct_conversations;');
  await pool.query('DROP TABLE IF EXISTS friend_requests;');
  await pool.query('DROP TABLE IF EXISTS friendships;');
};
