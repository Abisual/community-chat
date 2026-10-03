# Voice Communication

## Overview

Voice communication is implemented using LiveKit for WebRTC transport in multiple fixed public voice rooms.

## Architecture

- Multiple fixed public voice rooms for MVP
- No private messaging or rooms
- All audio processing handled through LiveKit WebRTC implementation
- LiveKit API secrets never reach the client

## Implementation Details

- Authenticated clients list active predefined rooms through `GET /voice/rooms` and request a five-minute, room-scoped LiveKit participant token through `POST /voice/rooms/{roomId}/token`.
- The server reads `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` from its environment. Only the URL and signed participant token are returned to the client; API secrets stay on the server.
- Docker Compose runs LiveKit alongside PostgreSQL and the application server. Production deployments must expose LiveKit through the deployment's secure WebSocket endpoint and allow its configured WebRTC ports.
- Electron client uses Chromium's Web APIs for microphone access
- Microphone enumeration, testing, and input-level monitoring are not implemented in the current MVP.
- No arbitrary Windows system output-device control from browser APIs

## Audio Features

- Global toggle mute/unmute supported via Electron globalShortcut
- True hold-to-talk requires key-down/key-up handling (future implementation)
- If native keyboard hook required on Windows, this will be implemented as a later dependency
- No complex audio routing or system-level device controls in MVP

## Constraints

- No voice room management features
- No microphone/output device settings, input-level test, or advanced audio settings
- No voice quality configuration
- Only predefined public rooms available
