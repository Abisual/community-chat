import { Request, Response } from 'express';
import { AccessToken, RoomConfiguration } from 'livekit-server-sdk';
import { VoiceRoomDatabase } from '../database/models/VoiceRoom';

type AuthenticatedRequest = Request & {
  user?: { userId: number; username: string };
};

export class VoiceController {
  static async listRooms(_req: Request, res: Response): Promise<void> {
    try {
      const rooms = await VoiceRoomDatabase.findAll();
      res.json({
        rooms: rooms.map(({ id, name, description, max_participants }) => ({
          id,
          name,
          description,
          maxParticipants: max_participants
        }))
      });
    } catch (error) {
      console.error('Voice room listing error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async createJoinToken(req: AuthenticatedRequest, res: Response): Promise<void> {
    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;
    const livekitUrl = process.env.LIVEKIT_URL;

    if (!apiKey || !apiSecret || !livekitUrl) {
      res.status(503).json({ error: 'Voice service is not configured' });
      return;
    }

    const roomId = Number(req.params.roomId);
    if (!Number.isSafeInteger(roomId) || roomId <= 0) {
      res.status(400).json({ error: 'Invalid voice room' });
      return;
    }

    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    try {
      const room = await VoiceRoomDatabase.findActiveById(roomId);
      if (!room) {
        res.status(404).json({ error: 'Voice room not found' });
        return;
      }

      const token = new AccessToken(apiKey, apiSecret, {
        identity: String(req.user.userId),
        name: req.user.username,
        ttl: '5m'
      });
      token.addGrant({
        roomJoin: true,
        room: room.name,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true
      });
      token.roomConfig = new RoomConfiguration({
        name: room.name,
        maxParticipants: room.max_participants
      });

      res.json({
        url: livekitUrl,
        token: await token.toJwt(),
        room: {
          id: room.id,
          name: room.name,
          maxParticipants: room.max_participants
        }
      });
    } catch (error) {
      console.error('Voice join token error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
