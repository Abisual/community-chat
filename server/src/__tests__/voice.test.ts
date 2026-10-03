import request from 'supertest';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { VoiceRoom } from '@community-chat/shared';

jest.mock('../database/models/VoiceRoom', () => ({
  VoiceRoomDatabase: {
    findAll: jest.fn(),
    findActiveById: jest.fn()
  }
}));

import app from '../index';
import { AuthService } from '../auth/auth.service';
import { VoiceRoomDatabase } from '../database/models/VoiceRoom';

const findAll = VoiceRoomDatabase.findAll as jest.MockedFunction<typeof VoiceRoomDatabase.findAll>;
const findActiveById = VoiceRoomDatabase.findActiveById as jest.MockedFunction<typeof VoiceRoomDatabase.findActiveById>;

const room: VoiceRoom = {
  id: 2,
  name: 'Tech Talk',
  description: 'Technology discussions',
  max_participants: 15,
  is_active: true,
  created_at: new Date('2025-01-01T00:00:00.000Z'),
  updated_at: new Date('2025-01-01T00:00:00.000Z')
};

describe('Public voice room API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    process.env.LIVEKIT_URL = 'wss://voice.example.test';
    process.env.LIVEKIT_API_KEY = 'test-api-key';
    process.env.LIVEKIT_API_SECRET = 'test-api-secret-with-sufficient-length';
  });

  it('requires authentication to list predefined rooms', async () => {
    await request(app).get('/voice/rooms').expect(401);
    expect(findAll).not.toHaveBeenCalled();
  });

  it('lists active predefined rooms for an authenticated user', async () => {
    findAll.mockResolvedValue([room]);

    const response = await request(app)
      .get('/voice/rooms')
      .set('Authorization', `Bearer ${AuthService.generateAccessToken(42, 'alice')}`)
      .expect(200);

    expect(response.body).toEqual({
      rooms: [{ id: 2, name: 'Tech Talk', description: 'Technology discussions', maxParticipants: 15 }]
    });
  });

  it('rejects malformed room identifiers without querying the database', async () => {
    await request(app)
      .post('/voice/rooms/not-a-number/token')
      .set('Authorization', `Bearer ${AuthService.generateAccessToken(42, 'alice')}`)
      .expect(400);

    expect(findActiveById).not.toHaveBeenCalled();
  });

  it('does not issue credentials for inactive or unknown rooms', async () => {
    findActiveById.mockResolvedValue(null);

    await request(app)
      .post('/voice/rooms/2/token')
      .set('Authorization', `Bearer ${AuthService.generateAccessToken(42, 'alice')}`)
      .expect(404);
  });

  it('issues a short-lived LiveKit token restricted to the selected room', async () => {
    findActiveById.mockResolvedValue(room);

    const response = await request(app)
      .post('/voice/rooms/2/token')
      .set('Authorization', `Bearer ${AuthService.generateAccessToken(42, 'alice')}`)
      .expect(200);

    expect(response.body.url).toBe('wss://voice.example.test');
    expect(response.body.room).toEqual({ id: 2, name: 'Tech Talk', maxParticipants: 15 });
    expect(response.body).not.toHaveProperty('apiSecret');

    const claims = jwt.verify(response.body.token, process.env.LIVEKIT_API_SECRET!) as JwtPayload & {
      video: Record<string, unknown>;
    };
    expect(claims.iss).toBe('test-api-key');
    expect(claims.sub).toBe('42');
    expect(claims.name).toBe('alice');
    const now = Math.floor(Date.now() / 1000);
    expect(claims.exp).toBeGreaterThan(now);
    expect(claims.exp).toBeLessThanOrEqual(now + 305);
    expect(claims.video).toMatchObject({
      roomJoin: true,
      room: 'Tech Talk',
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });
    expect(claims.video).not.toHaveProperty('roomCreate');
    expect(claims.video).not.toHaveProperty('roomAdmin');
    expect(claims.roomConfig).toMatchObject({ name: 'Tech Talk', maxParticipants: 15 });
  });

  it('returns service unavailable when LiveKit credentials are missing', async () => {
    delete process.env.LIVEKIT_API_SECRET;

    await request(app)
      .post('/voice/rooms/2/token')
      .set('Authorization', `Bearer ${AuthService.generateAccessToken(42, 'alice')}`)
      .expect(503);

    expect(findActiveById).not.toHaveBeenCalled();
  });
});
