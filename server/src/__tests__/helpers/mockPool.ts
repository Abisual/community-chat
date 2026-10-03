type UserRow = {
  id: number;
  username: string;
  password_hash: string;
  created_at: Date;
  updated_at: Date;
};

type SessionRow = {
  id: number;
  user_id: number;
  refresh_token_hash: string;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
};

let users: UserRow[] = [];
let sessions: SessionRow[] = [];
let nextUserId = 1;
let nextSessionId = 1;

function normalizeSql(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function likeMatch(value: string, pattern: string): boolean {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`^${escaped.replace(/%/g, '.*')}$`);
  return regex.test(value);
}

export const pool = {
  query: async (text: string, params: unknown[] = []) => {
    const sql = normalizeSql(text);

    if (sql.startsWith('INSERT INTO users')) {
      const [username, password_hash] = params as [string, string];
      if (users.some((user) => user.username === username)) {
        const error = new Error('duplicate key value violates unique constraint') as Error & { code: string };
        error.code = '23505';
        throw error;
      }

      const now = new Date();
      const user: UserRow = {
        id: nextUserId++,
        username,
        password_hash,
        created_at: now,
        updated_at: now
      };
      users.push(user);
      return { rows: [user], rowCount: 1 };
    }

    if (sql.startsWith('SELECT id, username, password_hash FROM users WHERE username')) {
      const rows = users.filter((user) => user.username === params[0]);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('SELECT password_hash FROM users')) {
      const rows = users.filter((user) => user.username === params[0]);
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('DELETE FROM users WHERE username LIKE')) {
      const before = users.length;
      users = users.filter((user) => !likeMatch(user.username, params[0] as string));
      return { rows: [], rowCount: before - users.length };
    }

    if (sql.startsWith('DELETE FROM users')) {
      const count = users.length;
      users = [];
      nextUserId = 1;
      return { rows: [], rowCount: count };
    }

    if (sql.startsWith('INSERT INTO sessions')) {
      const [user_id, refresh_token_hash, expires_at] = params as [number, string, Date];
      const now = new Date();
      const session: SessionRow = {
        id: nextSessionId++,
        user_id,
        refresh_token_hash,
        expires_at,
        created_at: now,
        updated_at: now
      };
      sessions.push(session);
      return { rows: [session], rowCount: 1 };
    }

    if (sql.startsWith('WITH revoked AS')) {
      const [oldHash, now, newHash, expiresAt] = params as [string, Date, string, Date];
      const existing = sessions.find((session) => session.refresh_token_hash === oldHash && session.expires_at > now);
      if (!existing) return { rows: [], rowCount: 0 };

      sessions = sessions.filter((session) => session.refresh_token_hash !== oldHash);
      sessions.push({
        id: nextSessionId++,
        user_id: existing.user_id,
        refresh_token_hash: newHash,
        expires_at: expiresAt,
        created_at: new Date(),
        updated_at: new Date()
      });
      const user = users.find((candidate) => candidate.id === existing.user_id);
      return { rows: [{ user_id: existing.user_id, username: user?.username }], rowCount: 1 };
    }

    if (sql.includes('FROM sessions s') && sql.includes('JOIN users u')) {
      const [refreshTokenHash, now] = params as [string, Date];
      const rows = sessions
        .filter((session) => session.refresh_token_hash === refreshTokenHash && session.expires_at > now)
        .map((session) => {
          const user = users.find((candidate) => candidate.id === session.user_id);
          return { ...session, username: user?.username };
        });
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('SELECT id FROM sessions WHERE refresh_token_hash')) {
      const [refreshTokenHash, now] = params as [string, Date];
      const rows = sessions
        .filter((session) => session.refresh_token_hash === refreshTokenHash && session.expires_at > now)
        .map((session) => ({ id: session.id }));
      return { rows, rowCount: rows.length };
    }

    if (sql.startsWith('DELETE FROM sessions WHERE refresh_token_hash')) {
      const before = sessions.length;
      sessions = sessions.filter((session) => session.refresh_token_hash !== params[0]);
      return { rows: [], rowCount: before - sessions.length };
    }

    if (sql.startsWith('DELETE FROM sessions')) {
      const count = sessions.length;
      sessions = [];
      return { rows: [], rowCount: count };
    }

    if (sql.startsWith('SELECT * FROM sessions')) {
      return { rows: sessions.map((session) => ({ ...session })), rowCount: sessions.length };
    }

    throw new Error(`Unhandled mock query: ${sql}`);
  },
  end: async () => undefined,
  connect: async () => {
    throw new Error('connect() is not used in unit tests');
  }
};

export const testConnection = async () => undefined;
