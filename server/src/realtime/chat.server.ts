import { Server as HttpServer } from 'http';
import { RawData, WebSocket, WebSocketServer } from 'ws';
import { AuthService } from '../auth/auth.service';
import { ChatMessageDatabase } from '../database/models/ChatMessage';
import { socialDatabase } from '../database/models/Social';
import { registerUserSocket, sendToUsers, unregisterUserSocket } from './connections';

const AUTH_TIMEOUT_MS = 5000;
const HISTORY_LIMIT = 50;
const MAX_MESSAGE_LENGTH = 2000;

interface ChatClient {
  socket: WebSocket;
  user?: { userId: number; username: string };
  authenticating: boolean;
  alive: boolean;
  authExpiresAt?: number;
  messageWindowAt?: number;
  messageCount?: number;
}

interface PresenceEntry {
  username: string;
  clients: Set<ChatClient>;
}

function send(socket: WebSocket, message: unknown): void {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify(message));
  }
}

function parseMessage(data: RawData): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(data.toString());
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

export function attachChatWebSocket(server: HttpServer): WebSocketServer {
  const webSocketServer = new WebSocketServer({ server, path: '/ws/chat', maxPayload: 16 * 1024 });
  const clients = new Set<ChatClient>();
  const presence = new Map<number, PresenceEntry>();

  const broadcast = (message: unknown, except?: WebSocket) => {
    const serialized = JSON.stringify(message);
    for (const client of clients) {
      if (client.socket !== except && client.user && client.socket.readyState === WebSocket.OPEN) {
        client.socket.send(serialized);
      }
    }
  };

  webSocketServer.on('connection', (socket) => {
    const client: ChatClient = { socket, authenticating: false, alive: true };
    clients.add(client);

    const authTimeout = setTimeout(() => {
      if (!client.user) socket.close(4401, 'Authentication required');
    }, AUTH_TIMEOUT_MS);
    authTimeout.unref();

    socket.on('pong', () => { client.alive = true; });
    let messageQueue = Promise.resolve();
    socket.on('message', (data) => {
      messageQueue = messageQueue.then(() => handleMessage(client, data)).catch((error) => {
        console.error('WebSocket message handler failed:', error);
        socket.close(1011, 'Realtime service unavailable');
      });
    });

    socket.on('close', () => {
      clearTimeout(authTimeout);
      clients.delete(client);
      if (!client.user) return;
      unregisterUserSocket(client.user.userId, client.socket);

      const entry = presence.get(client.user.userId);
      if (!entry) return;
      entry.clients.delete(client);
      if (entry.clients.size === 0) {
        presence.delete(client.user.userId);
        broadcast({
          type: 'presence.changed',
          user: { id: client.user.userId, username: client.user.username, status: 'offline' }
        });
      }
    });

    async function handleMessage(current: ChatClient, data: RawData): Promise<void> {
      const message = parseMessage(data);
      if (!message || typeof message.type !== 'string') {
        send(socket, { type: 'error', code: 'invalid_message', message: 'Expected a JSON message with a type' });
        return;
      }

      if (!current.user) {
        if (current.authenticating) {
          send(socket, { type: 'error', code: 'authentication_in_progress' });
          return;
        }
        if (message.type !== 'authenticate' || typeof message.accessToken !== 'string') {
          socket.close(4401, 'Authenticate before sending chat events');
          return;
        }

        current.authenticating = true;
        let user: { userId: number; username: string; exp: number };
        try {
          user = AuthService.validateAccessToken(message.accessToken);
        } catch {
          socket.close(4401, 'Invalid or expired access token');
          return;
        }

        let history;
        try {
          history = await ChatMessageDatabase.listRecent(HISTORY_LIMIT);
        } catch (error) {
          console.error('Chat history load error:', error);
          socket.close(1011, 'Chat service unavailable');
          return;
        }

        if (socket.readyState !== WebSocket.OPEN) return;

        const expiresInMs = user.exp * 1000 - Date.now();
        if (expiresInMs <= 0) {
          socket.close(4401, 'Access token expired');
          return;
        }
        current.user = { userId: user.userId, username: user.username };
        current.authExpiresAt = user.exp * 1000;
        registerUserSocket(user.userId, socket);
        const authExpiry = setTimeout(() => socket.close(4401, 'Access token expired'), expiresInMs);
        authExpiry.unref();
        socket.once('close', () => clearTimeout(authExpiry));
        const existing = presence.get(user.userId);
        if (existing) existing.clients.add(current);
        else presence.set(user.userId, { username: user.username, clients: new Set([current]) });

        send(socket, { type: 'authenticated', user: { id: user.userId, username: user.username } });
        send(socket, { type: 'chat.history', messages: history });
        send(socket, {
          type: 'presence.snapshot',
          users: [...presence.entries()].map(([id, entry]) => ({ id, username: entry.username }))
        });

        if (!existing) {
          broadcast({
            type: 'presence.changed',
            user: { id: user.userId, username: user.username, status: 'online' }
          }, socket);
        }
        return;
      }

      if (message.type === 'private.message.send') {
        const conversationId = message.conversationId;
        if (!Number.isSafeInteger(conversationId) || Number(conversationId) <= 0 || Number(conversationId) > 2_147_483_647
          || typeof message.content !== 'string') {
          send(socket, { type: 'error', code: 'invalid_private_message' });
          return;
        }
        const now = Date.now();
        if (!current.messageWindowAt || now - current.messageWindowAt >= 10_000) {
          current.messageWindowAt = now;
          current.messageCount = 0;
        }
        current.messageCount = (current.messageCount ?? 0) + 1;
        if (current.messageCount > 30) {
          send(socket, { type: 'error', code: 'rate_limited' });
          return;
        }
        const content = message.content.trim();
        if (!content || content.length > MAX_MESSAGE_LENGTH) {
          send(socket, { type: 'error', code: 'invalid_content' });
          return;
        }
        try {
          const saved = await socialDatabase.createPrivateMessage(Number(conversationId), current.user.userId, content);
          const { recipient_id, ...privateMessage } = saved;
          sendToUsers([saved.sender_id, recipient_id], { type: 'private.message', message: privateMessage });
        } catch (error: any) {
          if (error?.code === 'conversation_not_found') {
            send(socket, { type: 'error', code: 'conversation_not_found' });
          } else {
            console.error('Private message persistence error:', error);
            send(socket, { type: 'error', code: 'message_unavailable' });
          }
        }
        return;
      }

      if (message.type !== 'chat.send') {
        send(socket, { type: 'error', code: 'unsupported_event' });
        return;
      }
      if (typeof message.content !== 'string') {
        send(socket, { type: 'error', code: 'invalid_content', message: 'Message content must be text' });
        return;
      }

      const content = message.content.trim();
      if (!content || content.length > MAX_MESSAGE_LENGTH) {
        send(socket, {
          type: 'error',
          code: 'invalid_content',
          message: `Message content must contain 1 to ${MAX_MESSAGE_LENGTH} characters`
        });
        return;
      }

      try {
        const saved = await ChatMessageDatabase.create(current.user.userId, content);
        broadcast({ type: 'chat.message', message: saved });
      } catch (error) {
        console.error('Chat message persistence error:', error);
        send(socket, { type: 'error', code: 'message_unavailable', message: 'Message could not be sent' });
      }
    }
  });

  const heartbeat = setInterval(() => {
    for (const client of clients) {
      if (!client.alive) {
        client.socket.terminate();
        continue;
      }
      client.alive = false;
      client.socket.ping();
    }
  }, 30000);
  heartbeat.unref();
  webSocketServer.on('close', () => clearInterval(heartbeat));
  webSocketServer.on('error', (error) => console.error('Chat WebSocket server error:', error));

  return webSocketServer;
}
