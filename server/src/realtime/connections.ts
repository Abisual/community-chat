import { WebSocket } from 'ws';

const socketsByUser = new Map<number, Set<WebSocket>>();

export function registerUserSocket(userId: number, socket: WebSocket): void {
  let sockets = socketsByUser.get(userId);
  if (!sockets) {
    sockets = new Set();
    socketsByUser.set(userId, sockets);
  }
  sockets.add(socket);
}

export function unregisterUserSocket(userId: number, socket: WebSocket): void {
  const sockets = socketsByUser.get(userId);
  if (!sockets) return;
  sockets.delete(socket);
  if (sockets.size === 0) socketsByUser.delete(userId);
}

export function isUserOnline(userId: number): boolean {
  return (socketsByUser.get(userId)?.size ?? 0) > 0;
}

export function sendToUsers(userIds: number[], event: unknown): void {
  const serialized = JSON.stringify(event);
  for (const userId of new Set(userIds)) {
    for (const socket of socketsByUser.get(userId) ?? []) {
      if (socket.readyState === WebSocket.OPEN) socket.send(serialized);
    }
  }
}
