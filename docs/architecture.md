# Architecture

## Overview

This application follows a client-server architecture with specific constraints for the MVP:

- **Client**: Electron + React + TypeScript Windows desktop application
- **Server**: Node.js + Express + TypeScript REST and WebSocket server
- **Database**: PostgreSQL
- **Realtime Communication**: LiveKit for WebRTC voice transport
- **Deployment**: Docker Compose

## Client Architecture

The client is an Electron application built with React and TypeScript. It uses:

- Global shortcuts for mute/unmute (toggle)
- Chromium Web APIs for microphone enumeration, testing, and input level monitoring
- No localStorage for authentication secrets
- Direct WebSocket connections to the backend for real-time events

## Server Architecture

The server implements:

- REST API using Express.js with TypeScript
- WebSocket endpoints for realtime communication (chat/presence/events)
- PostgreSQL database for persistent storage
- Secure password handling using Argon2id
- Token-based authentication with short-lived access tokens and refresh tokens stored securely
- Predefined set of public voice rooms managed by the server

## Network

All production traffic uses HTTPS/WSS. PostgreSQL is not exposed publicly in production.
LiveKit API secrets never reach the client.