import { Response } from 'express';
import { AuthenticatedRequest } from '../auth/request';
import { isUserOnline, sendToUsers } from '../realtime/connections';
import { socialDatabase, SocialError } from '../database/models/Social';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_PG_INTEGER = 2_147_483_647;

function positiveId(value: unknown): number | null {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed <= MAX_PG_INTEGER ? parsed : null;
}

function mapError(error: unknown, res: Response): void {
  if (error instanceof SocialError) {
    switch (error.code) {
      case 'user_not_found': res.status(404).json({ error: 'User not found' }); return;
      case 'already_friends': res.status(409).json({ error: 'You are already friends' }); return;
      case 'request_pending': res.status(409).json({ error: 'An active friend request already exists' }); return;
      case 'request_not_found': res.status(404).json({ error: 'Pending friend request not found' }); return;
      case 'conversation_not_found': res.status(404).json({ error: 'Conversation not found' }); return;
    }
  }
  console.error('Social request failed:', error);
  res.status(500).json({ error: 'Internal server error' });
}

export class SocialController {
  static async searchUsers(req: AuthenticatedRequest, res: Response): Promise<void> {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (query.length < 2 || query.length > 50) {
      res.status(400).json({ error: 'Search must contain 2 to 50 characters' });
      return;
    }

    const escaped = query.replace(/[\\%_]/g, '\\$&');
    try {
      const users = await socialDatabase.searchUsers(req.user!.userId, `${escaped}%`, 20);
      res.json({ users: users.map((user) => ({ ...user, status: isUserOnline(user.id) ? 'online' : 'offline' })) });
    } catch (error) { mapError(error, res); }
  }

  static async sendFriendRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    const recipientId = req.body?.userId;
    if (!Number.isSafeInteger(recipientId) || recipientId <= 0 || recipientId > MAX_PG_INTEGER) {
      res.status(400).json({ error: 'A valid userId is required' });
      return;
    }
    if (recipientId === req.user!.userId) {
      res.status(400).json({ error: 'You cannot send a friend request to yourself' });
      return;
    }

    try {
      const request = await socialDatabase.createFriendRequest(req.user!.userId, recipientId);
      sendToUsers([recipientId], { type: 'friend.request.created' });
      res.status(201).json({ request: {
        id: request.id,
        requester: { id: request.requester_id, username: request.requester_username },
        recipient: { id: request.recipient_id, username: request.recipient_username },
        status: request.status,
        created_at: request.created_at
      } });
    } catch (error) { mapError(error, res); }
  }

  static async listFriendRequests(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const requests = await socialDatabase.listFriendRequests(req.user!.userId);
      res.json({
        incoming: requests.incoming.map((row) => ({ id: row.id, user: { id: row.requester_id, username: row.requester_username }, created_at: row.created_at })),
        outgoing: requests.outgoing.map((row) => ({ id: row.id, user: { id: row.recipient_id, username: row.recipient_username }, created_at: row.created_at }))
      });
    } catch (error) { mapError(error, res); }
  }

  static async acceptFriendRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    const requestId = positiveId(req.params.requestId);
    if (!requestId) { res.status(400).json({ error: 'Invalid request ID' }); return; }
    try {
      const accepted = await socialDatabase.acceptFriendRequest(req.user!.userId, requestId);
      sendToUsers(accepted.userIds, { type: 'friend.request.accepted' });
      res.json({ friend: accepted.request.requester_id === req.user!.userId
        ? { id: accepted.request.recipient_id, username: accepted.request.recipient_username }
        : { id: accepted.request.requester_id, username: accepted.request.requester_username } });
    } catch (error) { mapError(error, res); }
  }

  static async rejectFriendRequest(req: AuthenticatedRequest, res: Response): Promise<void> {
    const requestId = positiveId(req.params.requestId);
    if (!requestId) { res.status(400).json({ error: 'Invalid request ID' }); return; }
    try {
      const rejected = await socialDatabase.rejectFriendRequest(req.user!.userId, requestId);
      sendToUsers([rejected.requester_id, rejected.recipient_id], { type: 'friend.request.rejected' });
      res.json({ message: 'Friend request rejected' });
    } catch (error) { mapError(error, res); }
  }

  static async listFriends(req: AuthenticatedRequest, res: Response): Promise<void> {
    try {
      const friends = await socialDatabase.listFriends(req.user!.userId);
      res.json({ friends: friends.map((friend) => ({ ...friend, status: isUserOnline(friend.id) ? 'online' : 'offline' })) });
    } catch (error) { mapError(error, res); }
  }

  static async removeFriend(req: AuthenticatedRequest, res: Response): Promise<void> {
    const otherUserId = positiveId(req.params.userId);
    if (!otherUserId) { res.status(400).json({ error: 'Invalid user ID' }); return; }
    if (otherUserId === req.user!.userId) { res.status(400).json({ error: 'Invalid user ID' }); return; }
    try {
      const removed = await socialDatabase.removeFriendship(req.user!.userId, otherUserId);
      if (!removed) { res.status(404).json({ error: 'Friendship not found' }); return; }
      sendToUsers([req.user!.userId, otherUserId], { type: 'friend.removed' });
      res.json({ message: 'Friend removed' });
    } catch (error) { mapError(error, res); }
  }

  static async openConversation(req: AuthenticatedRequest, res: Response): Promise<void> {
    const otherUserId = req.body?.userId;
    if (!Number.isSafeInteger(otherUserId) || otherUserId <= 0 || otherUserId > MAX_PG_INTEGER) {
      res.status(400).json({ error: 'A valid userId is required' });
      return;
    }
    if (otherUserId === req.user!.userId) {
      res.status(400).json({ error: 'You cannot open a conversation with yourself' });
      return;
    }
    try {
      const conversation = await socialDatabase.openConversation(req.user!.userId, otherUserId);
      res.status(200).json({ conversation: {
        id: conversation.id,
        user: { id: conversation.user_id, username: conversation.username },
        created_at: conversation.created_at
      } });
    } catch (error) { mapError(error, res); }
  }

  static async getMessages(req: AuthenticatedRequest, res: Response): Promise<void> {
    const conversationId = positiveId(req.params.conversationId);
    if (!conversationId) { res.status(400).json({ error: 'Invalid conversation ID' }); return; }
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
      res.status(400).json({ error: 'Limit must be an integer from 1 to 100' });
      return;
    }
    let beforeId: string | undefined;
    if (req.query.before !== undefined) {
      if (typeof req.query.before !== 'string' || !/^[1-9]\d{0,18}$/.test(req.query.before)) {
        res.status(400).json({ error: 'Invalid message cursor' });
        return;
      }
      try {
        if (BigInt(req.query.before) > 9_223_372_036_854_775_807n) throw new Error('overflow');
        beforeId = req.query.before;
      } catch {
        res.status(400).json({ error: 'Invalid message cursor' });
        return;
      }
    }

    try {
      const conversation = await socialDatabase.getConversationForUser(conversationId, req.user!.userId);
      if (!conversation) { res.status(404).json({ error: 'Conversation not found' }); return; }
      const rows = await socialDatabase.listMessages(conversationId, limit + 1, beforeId);
      const hasMore = rows.length > limit;
      const messages = rows.slice(0, limit).reverse();
      res.json({ messages, hasMore, nextBeforeId: hasMore ? String(messages[0]?.id ?? '') : null });
    } catch (error) { mapError(error, res); }
  }

  static async sendPrivateMessage(req: AuthenticatedRequest, res: Response): Promise<void> {
    const conversationId = positiveId(req.params.conversationId);
    const rawContent = req.body?.content;
    if (!conversationId) { res.status(400).json({ error: 'Invalid conversation ID' }); return; }
    if (typeof rawContent !== 'string') { res.status(400).json({ error: 'Message content must be text' }); return; }
    const content = rawContent.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({ error: `Message content must contain 1 to ${MAX_MESSAGE_LENGTH} characters` });
      return;
    }
    try {
      const saved = await socialDatabase.createPrivateMessage(conversationId, req.user!.userId, content);
      const { recipient_id, ...message } = saved;
      sendToUsers([saved.sender_id, recipient_id], { type: 'private.message', message });
      res.status(201).json({ message });
    } catch (error) { mapError(error, res); }
  }
}

export function parsePositiveId(value: unknown): number | null {
  return positiveId(value);
}
