import { Request } from 'express';

export interface AuthenticatedUser {
  userId: number;
  username: string;
}

export type AuthenticatedRequest = Request & { user?: AuthenticatedUser };
