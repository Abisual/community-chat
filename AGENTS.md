# Project Engineering Rules

## Project Scope
- Electron + React + TypeScript Windows client
- Node.js + Express + TypeScript backend
- PostgreSQL database
- LiveKit for WebRTC voice transport
- Docker Compose
- REST for authentication/history/settings
- WebSocket for realtime chat/presence/events

## Architecture Rules
- Client-server architecture with specific constraints for the MVP
- Monorepo with client/, server/, shared/, infrastructure/ directories
- Use npm workspaces for project structure
- TypeScript configuration with proper type safety
- Modular project structure with clear separation of concerns

## Security Rules
- Argon2id password hashing
- Short-lived access tokens  
- Refresh tokens stored only as secure hashes on the server
- No localStorage for long-lived authentication secrets
- HTTPS/WSS in production
- PostgreSQL is not publicly exposed in production
- LiveKit API secrets never reach the client
- All API endpoints require authentication tokens
- Input data is sanitized and validated

## Authentication Rules
- No email verification  
- No OAuth
- REST API for authentication (POST /auth/login, POST /auth/refresh)
- Token-based sessions with short-lived access tokens and refresh tokens
- No private messaging or friends features in MVP
- No complex RBAC

## PostgreSQL Rules
- All database connections secured with environment-specific credentials
- Schema designed to support core MVP features:
  - User accounts (username, hashed passwords)
  - Session management
  - Voice room metadata (predefined set of public rooms)
  - Basic chat messages
  - User settings
- Database connection strings and secrets stored in environment variables
- Migration scripts for schema evolution
- All database operations use parameterized queries to prevent SQL injection
- Read-only connections used where possible
- PostgreSQL is not publicly exposed in production
- No Redis unless later proven necessary

## LiveKit/Voice-Room Rules
- Multiple fixed/public voice rooms (not single room)
- Rooms are predefined by the server
- Users can join and leave any available public voice room
- LiveKit API secrets never reach the client
- No private rooms or room management features
- Room names correspond to predefined application rooms

## Audio/PTT Rules
- Do NOT claim that Electron globalShortcut alone implements true hold-to-talk
- Document: globalShortcut is suitable for global toggle mute/unmute
- True hold-to-talk requires key-down/key-up global handling
- If a native keyboard hook is required on Windows, explicitly document that as a later implementation dependency
- Microphone enumeration/testing/input level use Electron/Chromium Web APIs where supported
- Do not assume arbitrary Windows system output-device control from browser APIs

## File Safety Rules
- The agent may modify project files required by the CURRENT milestone.
- The agent must not modify unrelated files.
- The agent must not delete existing project files unless explicitly required by the current task.
- The agent must not delete or overwrite documentation unless explicitly instructed.
- The agent must not use destructive cleanup commands.
- The agent must use relative paths.
- The agent must not access directories outside the project.
- The agent must not use PowerShell Set-Content for project files.
- Preserve existing work.

## Milestone Workflow  
- Work milestone by milestone. Only implement the milestone explicitly specified in the current task. Do not implement future milestones.
- Follow implementation in order: Milestone 1 → 2 → 3  
- Only implement current milestone features as specified
- Do NOT implement future milestones ahead of schedule
- DO NOT implement any features outside the established scope

## Do Not Implement Future Milestones
- Do NOT implement authentication, registration, or login flows (Milestone 2)
- Do NOT implement WebSocket/chat and presence features (Milestone 2) 
- Do NOT implement LiveKit voice integration (Milestone 3)
- Do NOT implement Electron UI (Milestone 3)
- Do NOT add Redis unless later proven necessary
- Do NOT add unrelated dependencies or features

## Documented Rules Enforcement
- All implementations must be consistent with approved decisions from docs/
- No changes to documentation files unless explicitly requested for correction
- Only use relative paths in file operations
- Use the write/edit tool rather than PowerShell Set-Content for Markdown files