import express, { Request, Response, NextFunction } from 'express';
import { AuthService } from './auth.service';
import { AuthenticatedRequest } from './request';

export class AuthMiddleware {
  static async authenticate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Access token required' });
        return;
      }

      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      const payload = AuthService.validateAccessToken(token);
      
      // Attach user info to request object by casting
      (req as AuthenticatedRequest).user = {
        userId: payload.userId,
        username: payload.username
      };
      
      next();
    } catch (error: any) {
      res.status(401).json({ error: 'Invalid or expired token' });
    }
  }
}
