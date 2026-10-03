# Realtime Communication

## Overview

Real-time communication is implemented using WebSocket connections for chat, presence, and events.

## Architecture

- The backend upgrades the existing HTTP server at `/ws/chat`; deployments terminate TLS at the public edge and expose this endpoint as WSS.
- Every connection must send an `authenticate` event with a short-lived access token before it can receive history, presence, or send messages.
- Global chat messages are persisted in PostgreSQL before they are broadcast to authenticated connections.
- Presence is tracked per user across all active connections in the server process. A user becomes offline when their last connection closes.

## Chat Protocol

Client to server:

- `{"type":"authenticate","accessToken":"..."}` - authenticate the connection
- `{"type":"chat.send","content":"..."}` - send a message containing 1 to 2000 characters

Server to client:

- `authenticated` - authenticated user identity
- `chat.history` - the latest 50 persisted messages, ordered oldest to newest
- `chat.message` - a persisted message broadcast to all authenticated connections
- `presence.snapshot` - users currently online when authentication completes
- `presence.changed` - a user becoming online or offline
- `error` - invalid or unsupported event information

Unauthenticated connections are closed after five seconds. Connections receive WebSocket ping frames every 30 seconds and are terminated when they fail to respond.

## Connection Handling

- The server manages connection lifecycle with an authentication timeout and ping/pong heartbeat.
- Clients reconnect as needed and authenticate each new connection with a current access token.
