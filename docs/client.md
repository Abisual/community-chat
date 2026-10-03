# Client Application

## Overview

The client is an Electron + React + TypeScript Windows desktop application.

## Technology Stack

- Electron for cross-platform desktop environment
- React for user interface components
- TypeScript for type safety
- Global shortcuts for mute/unmute functionality

## Features

- Desktop application with native Windows integration
- Real-time chat and presence features via WebSocket
- Voice communication through LiveKit WebRTC
- Microphone capture for LiveKit voice using Chromium/Electron media permissions
- No localStorage used for authentication secrets

## Architecture Notes

- Uses Electron globalShortcut for toggle mute/unmute only
- True hold-to-talk requires key-down/key-up handling (future implementation)
- Microphone access is currently limited to joining voice and toggling its microphone; device configuration/testing and input-level monitoring are not implemented
- No system-level audio device control from browser APIs

## User Experience

- Discord-like desktop workspace with navigation for Friends, Requests, Direct Messages, global chat, voice rooms, and Settings.
- The workspace provides a persistent voice dock while navigating, participant and speaking indicators, connection states, unread indicators, and loading/empty/error states.
- Direct messages and Friends are implemented; their end-to-end desktop smoke test remains pending in the current handoff.
- The screen-source picker and LiveKit screen-share stage are implemented. Real remote screen and window rendering has not yet been verified end to end; do not treat screen sharing as validated until another Electron client visibly renders changing source content.
- Settings currently expose account, voice/audio, and appearance sections. Microphone/device selection, microphone testing, input-level monitoring, persisted audio preferences, and true push-to-talk are not implemented.
- Authentication sessions are stored through Electron `safeStorage`; long-lived authentication tokens are not stored in renderer `localStorage`.
