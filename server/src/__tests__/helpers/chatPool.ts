interface TestUser {
  id: number;
  username: string;
}

interface TestMessage {
  id: number;
  user_id: number;
  username: string;
  content: string;
  created_at: Date;
}

const users = new Map<number, TestUser>();
let messages: TestMessage[] = [];
let nextMessageId = 1;

export function seedChatUser(id: number, username: string): void {
  users.set(id, { id, username });
}

export function resetChatData(): void {
  users.clear();
  messages = [];
  nextMessageId = 1;
}

export const pool = {
  query: async (text: string, params: unknown[] = []) => {
    const sql = text.replace(/\s+/g, ' ').trim();

    if (sql.startsWith('WITH inserted AS')) {
      const userId = params[0] as number;
      const user = users.get(userId);
      if (!user) throw new Error('user does not exist');
      const message: TestMessage = {
        id: nextMessageId++,
        user_id: userId,
        username: user.username,
        content: params[1] as string,
        created_at: new Date()
      };
      messages.push(message);
      return { rows: [message], rowCount: 1 };
    }

    if (sql.startsWith('SELECT id, user_id, username, content, created_at FROM (')) {
      const limit = params[0] as number;
      const rows = messages.slice(-limit);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('DELETE FROM chat_messages')) {
      const count = messages.length;
      messages = [];
      nextMessageId = 1;
      return { rows: [], rowCount: count };
    }

    throw new Error(`Unhandled chat mock query: ${sql}`);
  },
  end: async () => undefined,
  connect: async () => { throw new Error('connect() is not used in chat tests'); }
};

export const testConnection = async () => undefined;
