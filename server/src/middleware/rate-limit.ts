import { NextFunction, Request, Response } from 'express';
import { AuthenticatedRequest } from '../auth/request';

interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();
let operations = 0;

export function rateLimit(options: { limit: number; windowMs: number; scope: string }) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const authUser = (req as AuthenticatedRequest).user;
    const identity = authUser ? `user:${authUser.userId}` : `ip:${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const key = `${options.scope}:${identity}`;
    const now = Date.now();
    let entry = windows.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + options.windowMs };
      windows.set(key, entry);
    }
    entry.count++;

    if ((++operations & 255) === 0 || windows.size > 10_000) {
      for (const [candidate, value] of windows) {
        if (value.resetAt <= now) windows.delete(candidate);
      }
    }

    if (entry.count > options.limit) {
      res.setHeader('Retry-After', String(Math.max(1, Math.ceil((entry.resetAt - now) / 1000))));
      res.status(429).json({ error: 'Too many requests. Please try again later.' });
      return;
    }
    next();
  };
}

export function resetRateLimitsForTests(): void {
  windows.clear();
  operations = 0;
}
