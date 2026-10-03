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

- Native Windows desktop interface
- Minimal, focused on core communication features
- Simple authentication flow without email verification or OAuth
