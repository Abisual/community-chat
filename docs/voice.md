# Voice Communication

## Overview

Voice communication is implemented using LiveKit for WebRTC transport in multiple fixed public voice rooms.

## Architecture

- Multiple fixed public voice rooms for MVP
- No private messaging or rooms
- All audio processing handled through LiveKit WebRTC implementation
- LiveKit API secrets never reach the client

## Implementation Details

- Electron client uses Chromium's Web APIs for microphone access
- Microphone enumeration and testing is supported via Web APIs where available
- Input level monitoring via Web APIs
- No arbitrary Windows system output-device control from browser APIs

## Audio Features

- Global toggle mute/unmute supported via Electron globalShortcut
- True hold-to-talk requires key-down/key-up handling (future implementation)
- If native keyboard hook required on Windows, this will be implemented as a later dependency
- No complex audio routing or system-level device controls in MVP

## Constraints

- No voice room management features
- No advanced audio settings
- No voice quality configuration
- Only predefined public rooms available