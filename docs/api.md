# API Design

## Overview

The application provides both REST and WebSocket APIs for different use cases:

- REST endpoints for authentication, history, settings
- WebSocket endpoints for real-time communication (chat, presence, events)

## Authentication Flow

1. Users authenticate via REST API with username/password
2. Access tokens are short-lived (e.g., 15 minutes)
3. Refresh tokens are stored as secure hashes on the server
4. No localStorage is used for long-lived authentication secrets
5. No email verification or OAuth support

## REST API Endpoints

- `POST /auth/login` - Authenticate user and return tokens
- `POST /auth/refresh` - Exchange refresh token for new access token
- `GET /user/profile` - Get authenticated user profile
- `PUT /user/profile` - Update user profile
- `GET /rooms` - List available voice rooms (predefined public rooms)
- `GET /messages/history` - Get chat message history
- `GET /chat/history?limit={n}` - Get the latest authenticated global chat messages (limit defaults to 50 and is capped at 100)
- `GET /voice/rooms` - List active predefined public voice rooms (authenticated)
- `POST /voice/rooms/{roomId}/token` - Issue a short-lived LiveKit token scoped to an active room (authenticated)

The voice token response includes the configured LiveKit WebSocket URL and participant token. LiveKit API credentials are read from `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` on the server and are never returned to clients.

## WebSocket Endpoints

- `wss://host/ws/chat` - Authenticated global chat and presence events. The client authenticates with an `authenticate` message containing its short-lived access token, then may send `chat.send` messages.

## Security Considerations

- All API endpoints require authentication
- HTTPS/WSS enforced in production
- Tokens are validated on each request
- Input data is sanitized and validated
