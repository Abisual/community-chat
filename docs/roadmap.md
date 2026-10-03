# Roadmap

## Completed: MVP

- Basic voice communication in multiple fixed public rooms
- Real-time chat with presence
- Authentication without email verification or OAuth
- Secure token-based sessions
- Electron client with toggle mute/unmute
- Docker Compose deployment

## Completed: Social messaging

- User search, friend requests, friend list, and presence
- One-to-one private conversations with persisted history and realtime messages

## Current milestone: Desktop UX + Screen Sharing

- Discord-like desktop workspace and navigation
- Settings shell, persistent voice dock, connection states, and unread indicators
- Electron screen/window source picker and LiveKit screen-share publication
- Complete local two-client GUI verification, fix discovered issues, then deploy the verified local state and complete production smoke tests
- Screen sharing remains unverified until a second Electron client visibly renders changing screen and window content and lifecycle cleanup is checked

## Remaining Phase 2 Features

- Advanced audio settings
- Audio quality configuration
- System-level audio device control (Windows)
- Configurable push-to-talk with reliable key-down/key-up handling

## Phase 3 Features

- Advanced RBAC capabilities
- Redis integration for caching
- Multi-platform client support (macOS, Linux)
- Web-based interface options
- Email verification and OAuth support
- Advanced notification system
- Analytics and monitoring

## Technical Debt Reduction

- Code refactoring based on learnings
- Performance optimization
- Security enhancements
- Better error handling and logging

## Notes

- Feature development will be prioritized based on user feedback and usage analytics
- Major architectural changes are avoided to maintain stability
- All implementations respect security best practices

For the latest verified implementation and test state, see `development-status.md`.
