import { pool } from '../connection';
import { Pool } from 'pg';

export class SocialError extends Error {
  constructor(readonly code: 'user_not_found' | 'already_friends' | 'request_pending' | 'request_not_found' | 'conversation_not_found') {
    super(code);
  }
}

export interface PublicUser {
  id: number;
  username: string;
}

export interface FriendRequestRow {
  id: number;
  requester_id: number;
  requester_username: string;
  recipient_id: number;
  recipient_username: string;
  status: 'pending' | 'accepted' | 'rejected';
  created_at: Date;
}

export interface PrivateMessage {
  id: string;
  conversation_id: number;
  sender_id: number;
  sender_username: string;
  content: string;
  created_at: Date;
}

export class SocialDatabase {
  constructor(private readonly db: Pick<Pool, 'query'> = pool) {}

  async searchUsers(userId: number, prefix: string, limit: number): Promise<PublicUser[]> {
    const result = await this.db.query(`
      /* social.searchUsers */
      SELECT id, username FROM users
      WHERE id <> $1 AND username ILIKE $2 ESCAPE E'\\\\'
      ORDER BY username ASC, id ASC LIMIT $3
    `, [userId, prefix, limit]);
    return result.rows;
  }

  async createFriendRequest(requesterId: number, recipientId: number): Promise<FriendRequestRow> {
    const inserted = await this.db.query(`
      /* social.createFriendRequest */
      INSERT INTO friend_requests (requester_id, recipient_id)
      SELECT $1, $2
      WHERE EXISTS (SELECT 1 FROM users WHERE id = $1)
        AND EXISTS (SELECT 1 FROM users WHERE id = $2)
        AND NOT EXISTS (
          SELECT 1 FROM friendships
          WHERE user_low_id = LEAST($1, $2) AND user_high_id = GREATEST($1, $2)
        )
        AND NOT EXISTS (
          SELECT 1 FROM friend_requests
          WHERE status = 'pending'
            AND LEAST(requester_id, recipient_id) = LEAST($1, $2)
            AND GREATEST(requester_id, recipient_id) = GREATEST($1, $2)
        )
      ON CONFLICT DO NOTHING
      RETURNING id, requester_id, recipient_id, status, created_at
    `, [requesterId, recipientId]);

    if (inserted.rows.length > 0) {
      const result = await this.db.query(`
        /* social.requestDetails */
        SELECT r.id, r.requester_id, requester.username AS requester_username,
          r.recipient_id, recipient.username AS recipient_username, r.status, r.created_at
        FROM friend_requests r
        JOIN users requester ON requester.id = r.requester_id
        JOIN users recipient ON recipient.id = r.recipient_id
        WHERE r.id = $1
      `, [inserted.rows[0].id]);
      return result.rows[0];
    }

    const state = await this.db.query(`
      /* social.requestState */
      SELECT EXISTS (SELECT 1 FROM users WHERE id = $1) AS requester_exists,
        EXISTS (SELECT 1 FROM users WHERE id = $2) AS recipient_exists,
        EXISTS (SELECT 1 FROM friendships WHERE user_low_id = LEAST($1, $2)
          AND user_high_id = GREATEST($1, $2)) AS already_friends,
        EXISTS (SELECT 1 FROM friend_requests WHERE status = 'pending'
          AND LEAST(requester_id, recipient_id) = LEAST($1, $2)
          AND GREATEST(requester_id, recipient_id) = GREATEST($1, $2)) AS request_pending
    `, [requesterId, recipientId]);
    const row = state.rows[0];
    if (!row?.requester_exists || !row?.recipient_exists) throw new SocialError('user_not_found');
    if (row.already_friends) throw new SocialError('already_friends');
    if (row.request_pending) throw new SocialError('request_pending');
    // The pending-pair unique index closes the race between the insert and state check.
    throw new SocialError('request_pending');
  }

  async listFriendRequests(userId: number): Promise<{ incoming: FriendRequestRow[]; outgoing: FriendRequestRow[] }> {
    const [incoming, outgoing] = await Promise.all([
      this.db.query(`
        /* social.incomingRequests */
        SELECT r.id, r.requester_id, requester.username AS requester_username,
          r.recipient_id, recipient.username AS recipient_username, r.status, r.created_at
        FROM friend_requests r JOIN users requester ON requester.id = r.requester_id
        JOIN users recipient ON recipient.id = r.recipient_id
        WHERE r.recipient_id = $1 AND r.status = 'pending'
        ORDER BY r.created_at DESC, r.id DESC LIMIT 100
      `, [userId]),
      this.db.query(`
        /* social.outgoingRequests */
        SELECT r.id, r.requester_id, requester.username AS requester_username,
          r.recipient_id, recipient.username AS recipient_username, r.status, r.created_at
        FROM friend_requests r JOIN users requester ON requester.id = r.requester_id
        JOIN users recipient ON recipient.id = r.recipient_id
        WHERE r.requester_id = $1 AND r.status = 'pending'
        ORDER BY r.created_at DESC, r.id DESC LIMIT 100
      `, [userId])
    ]);
    return { incoming: incoming.rows, outgoing: outgoing.rows };
  }

  async acceptFriendRequest(userId: number, requestId: number): Promise<{ request: FriendRequestRow; userIds: number[] }> {
    const result = await this.db.query(`
      /* social.acceptFriendRequest */
      WITH accepted AS (
        UPDATE friend_requests
        SET status = 'accepted', updated_at = CURRENT_TIMESTAMP, responded_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND recipient_id = $2 AND status = 'pending'
        RETURNING id, requester_id, recipient_id, status, created_at
      ), reverse_rejected AS (
        UPDATE friend_requests r
        SET status = 'rejected', updated_at = CURRENT_TIMESTAMP, responded_at = CURRENT_TIMESTAMP
        WHERE r.status = 'pending' AND r.id <> COALESCE((SELECT id FROM accepted), 0)
          AND LEAST(r.requester_id, r.recipient_id) = LEAST($2, (SELECT requester_id FROM accepted))
          AND GREATEST(r.requester_id, r.recipient_id) = GREATEST($2, (SELECT requester_id FROM accepted))
        RETURNING r.id
      ), friendship AS (
        INSERT INTO friendships (user_low_id, user_high_id)
        SELECT LEAST(requester_id, recipient_id), GREATEST(requester_id, recipient_id) FROM accepted
        ON CONFLICT DO NOTHING
        RETURNING user_low_id
      )
      SELECT a.id, a.requester_id, requester.username AS requester_username,
        a.recipient_id, recipient.username AS recipient_username, a.status, a.created_at
      FROM accepted a JOIN users requester ON requester.id = a.requester_id
      JOIN users recipient ON recipient.id = a.recipient_id
    `, [requestId, userId]);
    if (!result.rows[0]) throw new SocialError('request_not_found');
    const request = result.rows[0] as FriendRequestRow;
    return { request, userIds: [request.requester_id, request.recipient_id] };
  }

  async rejectFriendRequest(userId: number, requestId: number): Promise<FriendRequestRow> {
    const result = await this.db.query(`
      /* social.rejectFriendRequest */
      UPDATE friend_requests r
      SET status = 'rejected', updated_at = CURRENT_TIMESTAMP, responded_at = CURRENT_TIMESTAMP
      FROM users requester, users recipient
      WHERE r.id = $1 AND r.recipient_id = $2 AND r.status = 'pending'
        AND requester.id = r.requester_id AND recipient.id = r.recipient_id
      RETURNING r.id, r.requester_id, requester.username AS requester_username,
        r.recipient_id, recipient.username AS recipient_username, r.status, r.created_at
    `, [requestId, userId]);
    if (!result.rows[0]) throw new SocialError('request_not_found');
    return result.rows[0] as FriendRequestRow;
  }

  async listFriends(userId: number): Promise<PublicUser[]> {
    const result = await this.db.query(`
      /* social.listFriends */
      SELECT u.id, u.username FROM friendships f
      JOIN users u ON u.id = CASE WHEN f.user_low_id = $1 THEN f.user_high_id ELSE f.user_low_id END
      WHERE f.user_low_id = $1 OR f.user_high_id = $1
      ORDER BY u.username ASC, u.id ASC LIMIT 500
    `, [userId]);
    return result.rows;
  }

  async removeFriendship(userId: number, otherUserId: number): Promise<boolean> {
    const result = await this.db.query(`
      /* social.removeFriendship */
      DELETE FROM friendships WHERE user_low_id = LEAST($1, $2) AND user_high_id = GREATEST($1, $2)
      RETURNING user_low_id
    `, [userId, otherUserId]);
    return result.rows.length > 0;
  }

  async openConversation(userId: number, otherUserId: number): Promise<{ id: number; created_at: Date; user_id: number; username: string }> {
    const low = Math.min(userId, otherUserId);
    const high = Math.max(userId, otherUserId);
    const result = await this.db.query(`
      /* social.openConversation */
      WITH opened AS (
        INSERT INTO direct_conversations (user_low_id, user_high_id)
        SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM users WHERE id = $3)
          AND EXISTS (SELECT 1 FROM users WHERE id = CASE WHEN $3 = $1 THEN $2 ELSE $1 END)
      ON CONFLICT (user_low_id, user_high_id)
      DO UPDATE SET user_low_id = EXCLUDED.user_low_id
        RETURNING id, user_low_id, user_high_id, created_at
      )
      SELECT o.id, o.created_at, peer.id AS user_id, peer.username
      FROM opened o JOIN users peer ON peer.id = CASE WHEN $3 = o.user_low_id THEN o.user_high_id ELSE o.user_low_id END
    `, [low, high, userId]);
    if (!result.rows[0]) throw new SocialError('user_not_found');
    return result.rows[0];
  }

  async getConversationForUser(conversationId: number, userId: number): Promise<{ id: number; user_low_id: number; user_high_id: number } | null> {
    const result = await this.db.query(`
      /* social.getConversation */
      SELECT id, user_low_id, user_high_id FROM direct_conversations
      WHERE id = $1 AND (user_low_id = $2 OR user_high_id = $2)
    `, [conversationId, userId]);
    return result.rows[0] ?? null;
  }

  async listMessages(conversationId: number, limit: number, beforeId?: string): Promise<PrivateMessage[]> {
    const result = await this.db.query(`
      /* social.listMessages */
      SELECT m.id, m.conversation_id, m.sender_id, u.username AS sender_username,
        m.content, m.created_at
      FROM private_messages m JOIN users u ON u.id = m.sender_id
      WHERE m.conversation_id = $1 AND ($2::bigint IS NULL OR m.id < $2::bigint)
      ORDER BY m.id DESC LIMIT $3
    `, [conversationId, beforeId ?? null, limit]);
    return result.rows;
  }

  async createPrivateMessage(conversationId: number, senderId: number, content: string): Promise<PrivateMessage & { recipient_id: number }> {
    const result = await this.db.query(`
      /* social.createPrivateMessage */
      WITH inserted AS (
        INSERT INTO private_messages (conversation_id, sender_id, content)
        SELECT c.id, $2, $3 FROM direct_conversations c
        WHERE c.id = $1 AND (c.user_low_id = $2 OR c.user_high_id = $2)
        RETURNING id, conversation_id, sender_id, content, created_at
      )
      SELECT i.id, i.conversation_id, i.sender_id, u.username AS sender_username,
        i.content, i.created_at,
        CASE WHEN c.user_low_id = i.sender_id THEN c.user_high_id ELSE c.user_low_id END AS recipient_id
      FROM inserted i JOIN users u ON u.id = i.sender_id
      JOIN direct_conversations c ON c.id = i.conversation_id
    `, [conversationId, senderId, content]);
    if (!result.rows[0]) throw new SocialError('conversation_not_found');
    return result.rows[0] as PrivateMessage & { recipient_id: number };
  }
}

export const socialDatabase = new SocialDatabase();
