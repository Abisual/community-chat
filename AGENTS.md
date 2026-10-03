# Project Engineering Rules

## 1. Product Overview

This project is a self-hosted Discord-like community chat and voice application.

The product consists of:

- Windows desktop client
- Linux server
- Backend API
- PostgreSQL database
- Realtime communication
- Text chat
- Voice communication
- User accounts
- User settings
- Public voice rooms
- Group calls
- Future private/social functionality

The complete product scope is described below.

The fact that a feature is listed in this document does NOT mean it should be implemented in the current task. Current implementation scope is controlled by the milestone rules.

---

# 2. Technology Stack

## Client

- Electron
- React
- TypeScript
- Windows

## Backend

- Node.js
- Express
- TypeScript

## Database

- PostgreSQL

## Realtime

- WebSocket for application realtime events
- LiveKit for WebRTC voice transport / SFU

## Infrastructure

- Docker Compose
- Linux server

Do not implement a custom SFU.

Do not introduce Redis unless it is later proven necessary.

---

# 3. Complete Product Scope

## 3.1 User Accounts

The application supports:

- Registration
- Login
- Logout
- Globally unique usernames
- Password authentication
- Short-lived access tokens
- Refresh tokens
- Refresh token rotation
- Session management
- Persistent user settings

There is no email verification in the planned product.

There is no OAuth in the planned product.

---

## 3.2 Global Text Chat

The application supports a global realtime text chat.

Requirements:

- Realtime message delivery
- Message history
- Message timestamps
- Username associated with messages
- Authenticated users can send messages
- Authenticated users can receive messages
- WebSocket-based realtime delivery
- PostgreSQL-backed message history

The initial MVP has one global text chat.

---

## 3.3 Public Voice Rooms

The application supports multiple predefined public voice rooms.

Requirements:

- Multiple voice rooms
- Rooms are predefined by the server
- Users can join a room
- Users can leave a room
- Users can see participants
- Speaking indicator
- Mute/unmute
- Voice activity state
- LiveKit-based WebRTC transport

Users cannot create arbitrary rooms in the initial product design.

Private voice rooms are not part of the initial MVP.

---

## 3.4 Group Calls

The application supports group voice calls.

Group calls use LiveKit/WebRTC.

Requirements:

- Multiple participants
- Join/leave
- Microphone mute/unmute
- Speaking indicators
- Participant state
- Reliable realtime connection state
- Server-issued LiveKit access tokens

LiveKit API secrets must never be sent to the client.

No custom SFU should be implemented.

---

## 3.5 Audio Settings

The client supports audio configuration.

Requirements:

- Microphone selection
- Microphone testing
- Input level monitoring
- Microphone mute/unmute
- Output device selection where supported
- Persisted audio settings
- Configurable push-to-talk
- Global mute/unmute hotkey

Do not assume arbitrary Windows output-device control from browser APIs.

Microphone enumeration/testing/input-level functionality should use Electron/Chromium Web APIs where supported.

---

## 3.6 Push-to-Talk

The application supports configurable PTT.

Important implementation rule:

Electron `globalShortcut` alone does NOT implement true hold-to-talk.

A global toggle mute/unmute can use `globalShortcut`.

True hold-to-talk requires key-down/key-up handling.

If a native Windows keyboard hook is required, treat it as a later implementation dependency and document it rather than pretending `globalShortcut` provides true PTT.

---

## 3.7 User Settings

The client supports persistent user settings.

Examples:

- Microphone
- Output device where supported
- Input level/test settings
- Push-to-talk key
- Mute hotkey
- Other client audio preferences

Settings should be stored according to the application's security and architecture requirements.

---

# 4. Future Social Features

The complete product may later include social functionality.

These features are NOT part of the current MVP unless a milestone explicitly enables them.

## Friends

Potential functionality:

- Send friend request
- Accept friend request
- Reject friend request
- Remove friend
- Friend list
- Online/offline status
- Presence
- User lookup

## Private Messages

Potential functionality:

- One-to-one private conversations
- Private message history
- Realtime private messages
- Conversation list
- Read/unread state where required

## Private Calls

Potential functionality:

- One-to-one voice calls
- Group/private voice calls
- Incoming call state
- Outgoing call state
- Accept/reject
- Hang up
- Participant state
- Mute/unmute

These future features must not be implemented until explicitly included in the current milestone.

---

# 5. Authentication and Security

## Passwords

Passwords must use Argon2id.

Never store plaintext passwords.

## Access Tokens

Access tokens are short-lived.

## Refresh Tokens

Refresh tokens must:

- Be cryptographically random
- Never be stored plaintext in the database
- Be stored only as deterministic secure hashes
- Support lookup by deterministic hash
- Be rotated on refresh
- Revoke the previous token after successful rotation
- Be revoked on logout

Do not use salted password-style Argon2 hashes when deterministic lookup is required for refresh tokens.

## Client Security

Do not store long-lived authentication secrets in localStorage.

## Production Security

- HTTPS/WSS in production
- PostgreSQL must not be publicly exposed
- LiveKit API secrets never reach the client
- Secrets come from environment variables
- Protected API endpoints require authentication
- Validate external input
- Use parameterized SQL queries

---

# 6. Database

PostgreSQL must support the complete product architecture.

Core entities include:

- Users
- Authentication/session data
- Refresh-token/session records
- Predefined voice rooms
- Chat messages
- User settings

Future entities may include:

- Friend relationships
- Friend requests
- Private conversations
- Private messages
- Call/session metadata

Database schema must evolve through migrations.

All SQL queries must be parameterized.

Database credentials and connection strings must come from environment variables.

PostgreSQL must not be publicly exposed in production.

Do not add Redis unless proven necessary.

---

# 7. API

REST is used for:

- Registration
- Login
- Logout
- Token refresh
- User/settings operations
- Chat history
- Application configuration
- Other request/response operations

WebSocket is used for:

- Realtime chat
- Presence
- Realtime events
- Participant state
- Other realtime application events

LiveKit is used for:

- Voice media transport
- Voice room connections
- Group voice calls

Do not use WebSocket as a replacement for LiveKit media transport.

---

# 8. Voice Architecture

LiveKit is the WebRTC transport/SFU.

The backend is responsible for issuing appropriate LiveKit credentials/tokens.

The client connects to LiveKit directly for media transport.

LiveKit API secrets must never reach the client.

Do not implement a custom SFU.

---

# 9. Architecture Rules

Repository structure:

- client/
- server/
- shared/
- infrastructure/

Use TypeScript.

Use npm workspaces.

Keep client, server and shared code clearly separated.

Preserve the documented architecture.

Do not introduce new infrastructure without a demonstrated requirement.

Do not redesign working architecture without a concrete reason.

---

# 10. Milestone Rules

The complete product scope above describes the destination.

Implementation must happen milestone by milestone.

Only implement functionality explicitly authorized by the current task.

Do not implement future milestones early.

A task may explicitly authorize fixing existing code from an earlier milestone when required to restore the project to a working state.

## Current implementation order

Follow the roadmap defined in:

docs/roadmap.md

The exact current milestone always takes precedence over assumptions.

---

# 11. Future Feature Restrictions

Unless explicitly requested by the current task, do not implement:

- Friends
- Friend requests
- Private messages
- Private conversations
- Private calls
- Additional social systems
- WebSocket chat before its milestone
- LiveKit integration before its milestone
- Electron UI before its milestone
- PTT native hooks before their milestone
- Video
- Screen sharing
- File sharing
- Bots
- Streaming
- Payments
- Subscriptions
- Complex RBAC
- Redis
- Unrelated infrastructure

Do not create placeholder implementations of future features merely because they are described in this document.

---

# 12. File Safety

- Modify only files required by the current task
- Do not modify unrelated files
- Do not delete existing project files unless explicitly required
- Do not overwrite documentation unless explicitly instructed
- Preserve existing work
- Do not use destructive cleanup commands
- Do not access directories outside the project
- Use relative project paths for file operations
- Do not use PowerShell Set-Content for project files
- Use proper project editing tools

---

# 13. Documentation

Documentation in docs/ represents approved architectural decisions.

Relevant documentation includes:

- docs/architecture.md
- docs/database.md
- docs/api.md
- docs/realtime.md
- docs/voice.md
- docs/audio.md
- docs/client.md
- docs/deployment.md
- docs/testing.md
- docs/roadmap.md

Agents must read relevant documentation before modifying the corresponding subsystem.

Do not modify documentation unless:

1. explicitly requested, or
2. the task specifically requires correcting demonstrably incorrect documentation.

---

# 14. Git Rules

Do not create Git commits unless explicitly requested.

Before modifying the project:

- inspect Git status
- preserve existing user changes
- do not reset unrelated changes
- do not discard uncommitted work

After implementation:

- inspect Git diff
- verify only expected files changed

---

# 15. Verification

After implementation:

- run the appropriate build
- run relevant tests
- fix failures caused by the implementation
- rerun tests
- verify TypeScript compilation
- inspect Git diff
- report exactly what was changed
- report commands executed
- report test/build results

Do not claim a task is complete without actually verifying it.