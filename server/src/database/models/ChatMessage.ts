import { pool } from '../connection';

export interface ChatMessage {
  id: number;
  user_id: number;
  username: string;
  content: string;
  created_at: Date;
}

export class ChatMessageDatabase {
  static async listRecent(limit: number): Promise<ChatMessage[]> {
    const query = `
      SELECT id, user_id, username, content, created_at
      FROM (
        SELECT messages.id, messages.user_id, users.username, messages.content, messages.created_at
        FROM chat_messages AS messages
        JOIN users ON users.id = messages.user_id
        ORDER BY messages.created_at DESC, messages.id DESC
        LIMIT $1
      ) AS recent
      ORDER BY created_at ASC, id ASC
    `;
    const result = await pool.query(query, [limit]);
    return result.rows;
  }

  static async create(userId: number, content: string): Promise<ChatMessage> {
    const query = `
      WITH inserted AS (
        INSERT INTO chat_messages (user_id, content)
        VALUES ($1, $2)
        RETURNING id, user_id, content, created_at
      )
      SELECT inserted.id, inserted.user_id, users.username, inserted.content, inserted.created_at
      FROM inserted
      JOIN users ON users.id = inserted.user_id
    `;
    const result = await pool.query(query, [userId, content]);
    return result.rows[0];
  }
}
