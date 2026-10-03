import { AddressInfo } from 'net';
import request from 'supertest';
import WebSocket from 'ws';
import jwt from 'jsonwebtoken';
import { AuthService } from '../auth/auth.service';
import { createHttpServer } from '../index';
import { pool, resetSocialData, seedSocialUser } from './helpers/socialPool';
import { resetRateLimitsForTests } from '../middleware/rate-limit';

jest.mock('../database/connection', () => require('./helpers/socialPool'));

interface Event { type: string; [key: string]: any; }
interface PrivateMessage { content: string; sender_username: string; }
interface TestClient { socket: WebSocket; events: Event[]; waitFor: (type: string, from?: number) => Promise<Event>; }

let server: ReturnType<typeof createHttpServer>;
let baseUrl: string;
const sockets: WebSocket[] = [];
const token = (userId: number, username: string) => AuthService.generateAccessToken(userId, username);
const auth = (userId: number, username: string) => ({ Authorization: `Bearer ${token(userId, username)}` });

function createClient(): TestClient {
  const socket = new WebSocket(baseUrl.replace(/^http/, 'ws') + '/ws/chat');
  sockets.push(socket);
  const events: Event[] = [];
  const waiters: Array<{ type: string; from: number; resolve: (event: Event) => void }> = [];
  socket.on('message', (data) => {
    const event = JSON.parse(data.toString()) as Event;
    const index = events.push(event) - 1;
    for (let i = waiters.length - 1; i >= 0; i--) {
      if (waiters[i].type === event.type && index >= waiters[i].from) {
        const [waiter] = waiters.splice(i, 1);
        waiter.resolve(event);
      }
    }
  });
  return {
    socket,
    events,
    waitFor: (type, from = 0) => {
      const index = events.findIndex((event, i) => i >= from && event.type === type);
      if (index >= 0) return Promise.resolve(events[index]);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${type}`)), 2000);
        timer.unref();
        waiters.push({ type, from, resolve: (event) => { clearTimeout(timer); resolve(event); } });
      });
    }
  };
}

async function waitOpen(socket: WebSocket): Promise<void> {
  await new Promise<void>((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
}

async function connectAs(userId: number, username: string): Promise<TestClient> {
  const client = createClient();
  const authenticated = client.waitFor('authenticated');
  await waitOpen(client.socket);
  client.socket.send(JSON.stringify({ type: 'authenticate', accessToken: token(userId, username) }));
  await authenticated;
  return client;
}

async function closeSocket(socket: WebSocket): Promise<void> {
  if (socket.readyState === WebSocket.CLOSED) return;
  await new Promise<void>((resolve) => {
    socket.once('close', () => resolve());
    if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) socket.close();
  });
}

describe('Social and private messaging API', () => {
  beforeAll(async () => {
    server = createHttpServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(() => {
    resetSocialData();
    resetRateLimitsForTests();
    seedSocialUser(1, 'alice');
    seedSocialUser(2, 'bob');
    seedSocialUser(3, 'carol');
    seedSocialUser(4, 'dave');
  });

  afterEach(async () => { await Promise.all(sockets.splice(0).map(closeSocket)); });
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    await pool.end();
  });

  it('requires authentication on all social and private endpoints', async () => {
    await request(baseUrl).get('/users/search?q=bo').expect(401);
    await request(baseUrl).get('/friends').expect(401);
    await request(baseUrl).get('/friends/requests').expect(401);
    await request(baseUrl).post('/friends/requests').send({ userId: 2 }).expect(401);
    await request(baseUrl).post('/friends/requests/1/accept').expect(401);
    await request(baseUrl).post('/friends/requests/1/reject').expect(401);
    await request(baseUrl).delete('/friends/2').expect(401);
    await request(baseUrl).post('/conversations').send({ userId: 2 }).expect(401);
    await request(baseUrl).get('/conversations/1/messages').expect(401);
    await request(baseUrl).post('/conversations/1/messages').send({ content: 'private' }).expect(401);
  });

  it('returns only minimal user fields and supports bounded prefix search', async () => {
    const response = await request(baseUrl).get('/users/search?q=bo').set(auth(1, 'alice')).expect(200);
    expect(response.body.users).toEqual([{ id: 2, username: 'bob', status: 'offline' }]);
    expect(response.body.users[0]).not.toHaveProperty('password_hash');
    expect(response.body.users[0]).not.toHaveProperty('refresh_token');
    await request(baseUrl).get('/users/search?q=a').set(auth(1, 'alice')).expect(400);
    await request(baseUrl).get('/users/search?q=%25').set(auth(1, 'alice')).expect(400);
  });

  it('rejects self, malformed IDs, duplicate active requests, and already-friends requests', async () => {
    await request(baseUrl).post('/friends/requests').set(auth(1, 'alice')).send({ userId: 1 }).expect(400);
    await request(baseUrl).post('/friends/requests').set(auth(1, 'alice')).send({ userId: '2' }).expect(400);
    await request(baseUrl).post('/friends/requests').set(auth(1, 'alice')).send({ userId: 2_147_483_648 }).expect(400);
    await request(baseUrl).post('/friends/requests').set(auth(1, 'alice')).send({ userId: 999 }).expect(404);
    const sent = await request(baseUrl).post('/friends/requests').set(auth(1, 'alice')).send({ userId: 2 }).expect(201);
    expect(sent.body.request).toMatchObject({ requester: { id: 1, username: 'alice' }, recipient: { id: 2, username: 'bob' }, status: 'pending' });
    await request(baseUrl).post('/friends/requests').set(auth(1, 'alice')).send({ userId: 2 }).expect(409);
    await request(baseUrl).post('/friends/requests').set(auth(2, 'bob')).send({ userId: 1 }).expect(409);
    await request(baseUrl).post(`/friends/requests/${sent.body.request.id}/accept`).set(auth(2, 'bob')).expect(200);
    await request(baseUrl).post('/friends/requests').set(auth(1, 'alice')).send({ userId: 2 }).expect(409);
  });

  it('only lets the request recipient accept or reject; allows a new request after rejection', async () => {
    const sent = await request(baseUrl).post('/friends/requests').set(auth(2, 'bob')).send({ userId: 3 }).expect(201);
    const id = sent.body.request.id;
    await request(baseUrl).post(`/friends/requests/${id}/accept`).set(auth(1, 'alice')).expect(404);
    await request(baseUrl).post(`/friends/requests/${id}/reject`).set(auth(1, 'alice')).expect(404);
    await request(baseUrl).post(`/friends/requests/${id}/reject`).set(auth(3, 'carol')).expect(200);
    await request(baseUrl).post(`/friends/requests/${id}/reject`).set(auth(3, 'carol')).expect(404);
    await request(baseUrl).post('/friends/requests').set(auth(2, 'bob')).send({ userId: 3 }).expect(201);
    await request(baseUrl).post('/friends/requests/not-an-id/accept').set(auth(3, 'carol')).expect(400);
  });

  it('lists only current friends with presence and prevents removing others’ friendships', async () => {
    const requestToBob = await request(baseUrl).post('/friends/requests').set(auth(1, 'alice')).send({ userId: 2 }).expect(201);
    await request(baseUrl).post(`/friends/requests/${requestToBob.body.request.id}/accept`).set(auth(2, 'bob')).expect(200);
    const requestToCarol = await request(baseUrl).post('/friends/requests').set(auth(2, 'bob')).send({ userId: 3 }).expect(201);
    await request(baseUrl).post(`/friends/requests/${requestToCarol.body.request.id}/accept`).set(auth(3, 'carol')).expect(200);
    await request(baseUrl).delete('/friends/3').set(auth(1, 'alice')).expect(404);
    const result = await request(baseUrl).get('/friends').set(auth(1, 'alice')).expect(200);
    expect(result.body.friends).toEqual([{ id: 2, username: 'bob', status: 'offline' }]);
    await request(baseUrl).delete('/friends/2').set(auth(1, 'alice')).expect(200);
    await request(baseUrl).get('/friends').set(auth(1, 'alice')).expect(200).then((res) => expect(res.body.friends).toEqual([]));
    await request(baseUrl).delete('/friends/0').set(auth(1, 'alice')).expect(400);
  });

  it('authorizes conversation participants, validates messages, and paginates bounded history', async () => {
    const created = await request(baseUrl).post('/conversations').set(auth(2, 'bob')).send({ userId: 3 }).expect(200);
    const conversationId = created.body.conversation.id as number;
    const openedAgain = await request(baseUrl).post('/conversations').set(auth(3, 'carol')).send({ userId: 2 }).expect(200);
    expect(openedAgain.body.conversation.id).toBe(conversationId);
    expect(openedAgain.body.conversation.user).toEqual({ id: 2, username: 'bob' });
    await request(baseUrl).post('/conversations').set(auth(1, 'alice')).send({ userId: 1 }).expect(400);
    await request(baseUrl).post('/conversations').set(auth(1, 'alice')).send({ userId: '2' }).expect(400);

    await request(baseUrl).get(`/conversations/${conversationId}/messages`).set(auth(1, 'alice')).expect(404);
    await request(baseUrl).post(`/conversations/${conversationId}/messages`).set(auth(1, 'alice')).send({ content: 'intrusion' }).expect(404);
    await request(baseUrl).get('/conversations/abc/messages').set(auth(2, 'bob')).expect(400);
    await request(baseUrl).get('/conversations/2147483648/messages').set(auth(2, 'bob')).expect(400);
    await request(baseUrl).get(`/conversations/${conversationId}/messages?limit=101`).set(auth(2, 'bob')).expect(400);
    await request(baseUrl).get(`/conversations/${conversationId}/messages?before=99999999999999999999`).set(auth(2, 'bob')).expect(400);
    await request(baseUrl).post(`/conversations/${conversationId}/messages`).set(auth(2, 'bob')).send({ content: '   ' }).expect(400);
    await request(baseUrl).post(`/conversations/${conversationId}/messages`).set(auth(2, 'bob')).send({ content: 'x'.repeat(2001) }).expect(400);

    for (const content of ['one', 'two', 'three']) {
      await request(baseUrl).post(`/conversations/${conversationId}/messages`).set(auth(2, 'bob')).send({ content }).expect(201);
    }
    const page = await request(baseUrl).get(`/conversations/${conversationId}/messages?limit=2`).set(auth(3, 'carol')).expect(200);
    expect(page.body.messages.map((message: PrivateMessage) => message.content)).toEqual(['two', 'three']);
    expect(page.body.hasMore).toBe(true);
    expect(page.body.messages[0].sender_username).toBe('bob');
    const older = await request(baseUrl).get(`/conversations/${conversationId}/messages?limit=2&before=${page.body.nextBeforeId}`).set(auth(2, 'bob')).expect(200);
    expect(older.body.messages.map((message: PrivateMessage) => message.content)).toEqual(['one']);
    expect(older.body.hasMore).toBe(false);
  });

  it('rate-limits abusive user discovery calls', async () => {
    for (let i = 0; i < 60; i++) await request(baseUrl).get('/users/search?q=bo').set(auth(1, 'alice')).expect(200);
    const limited = await request(baseUrl).get('/users/search?q=bo').set(auth(1, 'alice')).expect(429);
    expect(Number(limited.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('rate-limits public login attempts by the real peer IP, not an untrusted forwarding header', async () => {
    for (let i = 0; i < 30; i++) {
      await request(baseUrl).post('/auth/login').set('X-Forwarded-For', `198.51.100.${i + 1}`).send({}).expect(400);
    }
    await request(baseUrl).post('/auth/login').set('X-Forwarded-For', '203.0.113.77').send({}).expect(429);
  });

  it('routes friend changes and private messages only to authenticated participants', async () => {
    const alice = await connectAs(1, 'alice');
    const bob = await connectAs(2, 'bob');
    const carol = await connectAs(3, 'carol');
    const aliceRequest = await request(baseUrl).post('/friends/requests').set(auth(1, 'alice')).send({ userId: 2 }).expect(201);
    await expect(bob.waitFor('friend.request.created')).resolves.toMatchObject({ type: 'friend.request.created' });
    const acceptedA = alice.waitFor('friend.request.accepted');
    const acceptedB = bob.waitFor('friend.request.accepted');
    await request(baseUrl).post(`/friends/requests/${aliceRequest.body.request.id}/accept`).set(auth(2, 'bob')).expect(200);
    await Promise.all([acceptedA, acceptedB]);

    const conversation = await request(baseUrl).post('/conversations').set(auth(1, 'alice')).send({ userId: 2 }).expect(200);
    const conversationId = conversation.body.conversation.id;
    const bobMessage = alice.waitFor('private.message');
    bob.socket.send(JSON.stringify({ type: 'private.message.send', conversationId, content: 'hello privately' }));
    await expect(bobMessage).resolves.toMatchObject({ message: { sender_id: 2, content: 'hello privately' } });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(carol.events.some((event) => event.type === 'private.message')).toBe(false);

    const unauthorizedEvent = carol.waitFor('error');
    carol.socket.send(JSON.stringify({ type: 'private.message.send', conversationId, content: 'should not arrive' }));
    await expect(unauthorizedEvent).resolves.toMatchObject({ code: 'conversation_not_found' });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(alice.events.filter((event) => event.type === 'private.message')).toHaveLength(1);
    expect(bob.events.filter((event) => event.type === 'private.message')).toHaveLength(1);
    expect(carol.events.filter((event) => event.type === 'private.message')).toHaveLength(0);
  });

  it('closes unauthenticated and expired WebSocket sessions', async () => {
    const unauthenticated = createClient();
    const closeUnauthenticated = new Promise<number>((resolve) => unauthenticated.socket.once('close', (code) => resolve(code)));
    await waitOpen(unauthenticated.socket);
    unauthenticated.socket.send(JSON.stringify({ type: 'chat.send', content: 'no token' }));
    await expect(closeUnauthenticated).resolves.toBe(4401);

    const expired = createClient();
    const closeExpired = new Promise<number>((resolve) => expired.socket.once('close', (code) => resolve(code)));
    await waitOpen(expired.socket);
    const expiredToken = jwt.sign({ userId: 1, username: 'alice' }, process.env.JWT_SECRET!, { expiresIn: '-1s' });
    expired.socket.send(JSON.stringify({ type: 'authenticate', accessToken: expiredToken }));
    await expect(closeExpired).resolves.toBe(4401);
  });
});
