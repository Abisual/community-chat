import { Request, Response } from 'express';
import { ChatMessageDatabase } from '../database/models/ChatMessage';

export class ChatController {
  static async getHistory(req: Request, res: Response): Promise<void> {
    const limit = req.query.limit === undefined ? 50 : Number(req.query.limit);
    if (!Number.isSafeInteger(limit) || limit < 1) {
      res.status(400).json({ error: 'Limit must be a positive integer' });
      return;
    }

    try {
      const messages = await ChatMessageDatabase.listRecent(Math.min(limit, 100));
      res.json({ messages });
    } catch (error) {
      console.error('Chat history error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
