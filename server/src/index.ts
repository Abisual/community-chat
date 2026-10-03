import express from 'express';
import { createServer as createHttpServerInstance, Server as HttpServer } from 'http';
import dotenv from 'dotenv';
import { connectToDatabase } from './database';
import { runMigrations } from './database/migrate';
import { AuthController } from './auth/auth.controller';
import { AuthMiddleware } from './auth/auth.middleware';
import { VoiceController } from './voice/voice.controller';
import { ChatController } from './chat/chat.controller';
import { attachChatWebSocket } from './realtime/chat.server';
import { SocialController } from './social/social.controller';
import { rateLimit } from './middleware/rate-limit';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
if (process.env.TRUST_PROXY_HOPS === '1') app.set('trust proxy', 1);

// Middleware
app.use(express.json({ limit: '16kb' }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Authentication endpoints
app.post('/auth/register', rateLimit({ scope: 'register', limit: 20, windowMs: 60 * 60 * 1000 }), AuthController.register);
app.post('/auth/login', rateLimit({ scope: 'login', limit: 30, windowMs: 15 * 60 * 1000 }), AuthController.login);
app.post('/auth/refresh', rateLimit({ scope: 'refresh', limit: 60, windowMs: 15 * 60 * 1000 }), AuthController.refresh);
app.post('/auth/logout', rateLimit({ scope: 'logout', limit: 60, windowMs: 15 * 60 * 1000 }), AuthController.logout);

// Predefined public voice rooms and room-scoped LiveKit credentials
app.get('/voice/rooms', AuthMiddleware.authenticate, VoiceController.listRooms);
app.post('/voice/rooms/:roomId/token', AuthMiddleware.authenticate, VoiceController.createJoinToken);
app.get('/chat/history', AuthMiddleware.authenticate, ChatController.getHistory);

// Authenticated social graph and direct conversations.
app.get('/users/search', AuthMiddleware.authenticate, rateLimit({ scope: 'user-search', limit: 60, windowMs: 60 * 1000 }), SocialController.searchUsers);
app.get('/friends', AuthMiddleware.authenticate, SocialController.listFriends);
app.delete('/friends/:userId', AuthMiddleware.authenticate, rateLimit({ scope: 'friend-actions', limit: 30, windowMs: 60 * 1000 }), SocialController.removeFriend);
app.get('/friends/requests', AuthMiddleware.authenticate, SocialController.listFriendRequests);
app.post('/friends/requests', AuthMiddleware.authenticate, rateLimit({ scope: 'friend-actions', limit: 30, windowMs: 60 * 1000 }), SocialController.sendFriendRequest);
app.post('/friends/requests/:requestId/accept', AuthMiddleware.authenticate, rateLimit({ scope: 'friend-actions', limit: 30, windowMs: 60 * 1000 }), SocialController.acceptFriendRequest);
app.post('/friends/requests/:requestId/reject', AuthMiddleware.authenticate, rateLimit({ scope: 'friend-actions', limit: 30, windowMs: 60 * 1000 }), SocialController.rejectFriendRequest);
app.post('/conversations', AuthMiddleware.authenticate, rateLimit({ scope: 'conversations', limit: 60, windowMs: 60 * 1000 }), SocialController.openConversation);
app.get('/conversations/:conversationId/messages', AuthMiddleware.authenticate, SocialController.getMessages);
app.post('/conversations/:conversationId/messages', AuthMiddleware.authenticate, rateLimit({ scope: 'private-messages', limit: 60, windowMs: 60 * 1000 }), SocialController.sendPrivateMessage);

// Protected route example (not required but for demonstration)
app.get('/protected', AuthMiddleware.authenticate, (req, res) => {
  res.json({ message: 'This is a protected route', user: (req as any).user });
});

app.use((error: unknown, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) { next(error); return; }
  const status = typeof error === 'object' && error !== null && 'status' in error
    ? Number((error as { status: unknown }).status)
    : 500;
  if (status === 413) { res.status(413).json({ error: 'Request body is too large' }); return; }
  if (status === 400) { res.status(400).json({ error: 'Invalid request body' }); return; }
  console.error('Unhandled request error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Connect to database and run migrations
const startServer = async () => {
  try {
    await connectToDatabase();
    await runMigrations();
    
    const server = createHttpServer();
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

export const createHttpServer = (): HttpServer => {
  const server = createHttpServerInstance(app);
  attachChatWebSocket(server);
  return server;
};

if (require.main === module) {
  startServer();
}

export default app;
