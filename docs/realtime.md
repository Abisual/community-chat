# Realtime Communication

## Overview

Real-time communication is implemented using WebSocket connections for chat, presence, and events.

## Architecture

- WebSocket endpoints use a separate port/connection from REST API
- Real-time data flows through WebSocket connections via JSON messages
- Events include:
  - Chat messages (real-time)
  - User presence updates
  - Room events (join/leave)

## Implementation Details

- Messages are sent and received over established WebSocket connections
- Presence tracking occurs automatically when users connect/disconnect
- All real-time communication is encrypted with WSS in production

## Connection Handling

- WebSockets maintain persistent connection for low-latency communication
- Clients handle reconnection logic gracefully
- Server manages connection lifecycle (heartbeat, timeout handling)