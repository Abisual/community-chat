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

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'Server is running',
    timestamp: new Date().toISOString()
  });
});

// Authentication endpoints
app.post('/auth/register', AuthController.register);
app.post('/auth/login', AuthController.login);
app.post('/auth/refresh', AuthController.refresh);
app.post('/auth/logout', AuthController.logout);

// Predefined public voice rooms and room-scoped LiveKit credentials
app.get('/voice/rooms', AuthMiddleware.authenticate, VoiceController.listRooms);
app.post('/voice/rooms/:roomId/token', AuthMiddleware.authenticate, VoiceController.createJoinToken);
app.get('/chat/history', AuthMiddleware.authenticate, ChatController.getHistory);

// Protected route example (not required but for demonstration)
app.get('/protected', AuthMiddleware.authenticate, (req, res) => {
  res.json({ message: 'This is a protected route', user: (req as any).user });
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
