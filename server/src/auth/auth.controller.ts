import { Request, Response } from 'express';
import { AuthService } from './auth.service';

export class AuthController {
  static async register(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body ?? {};

      // Validate input
      if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }

      if (username.trim().length < 3 || username.trim().length > 50) {
        res.status(400).json({ error: 'Username must be between 3 and 50 characters long' });
        return;
      }

      if (password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters long' });
        return;
      }

      const { user, accessToken, refreshToken } = await AuthService.register(username.trim(), password);

      res.status(201).json({
        user: {
          id: user.id,
          username: user.username
        },
        accessToken,
        refreshToken
      });
    } catch (error: any) {
      if (error.message === 'Username already exists') {
        res.status(409).json({ error: 'Username already exists' });
      } else {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  static async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = req.body ?? {};

      // Validate input
      if (typeof username !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Username and password are required' });
        return;
      }

      const { user, accessToken, refreshToken } = await AuthService.login(username.trim(), password);

      res.json({
        user,
        accessToken,
        refreshToken
      });
    } catch (error: any) {
      if (error.message === 'Invalid credentials') {
        res.status(401).json({ error: 'Invalid username or password' });
      } else {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  static async refresh(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body ?? {};

      if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
        res.status(400).json({ error: 'Refresh token is required' });
        return;
      }

      const result = await AuthService.refresh(refreshToken);

      res.json({
        accessToken: result.accessToken,
        refreshToken: result.refreshToken
      });
    } catch (error: any) {
      if (error.message === 'Invalid or expired refresh token') {
        res.status(401).json({ error: 'Invalid or expired refresh token' });
      } else {
        console.error('Refresh token error:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    }
  }

  static async logout(req: Request, res: Response): Promise<void> {
    try {
      const { refreshToken } = req.body ?? {};

      if (typeof refreshToken !== 'string' || refreshToken.length === 0) {
        res.status(400).json({ error: 'Refresh token is required' });
        return;
      }

      await AuthService.logout(refreshToken);

      res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
      console.error('Logout error:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}
