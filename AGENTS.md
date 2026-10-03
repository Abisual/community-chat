**# Project Engineering Rules**



**## 1. Product Overview**



This project is a self-hosted Discord-like community chat and voice application.



The product consists of:



\- Windows desktop client

\- Linux server

\- Backend API

\- PostgreSQL database

\- Realtime communication

\- Text chat

\- Voice communication

\- User accounts

\- User settings

\- Public voice rooms

\- Group calls

\- Future private/social functionality



The complete product scope is described below.



The fact that a feature is listed in this document does NOT mean it should be implemented in the current task. Current implementation scope is controlled by the milestone rules.



**---**



**# 2. Technology Stack**



**## Client**



\- Electron

\- React

\- TypeScript

\- Windows



**## Backend**



\- Node.js

\- Express

\- TypeScript



**## Database**



\- PostgreSQL



**## Realtime**



\- WebSocket for application realtime events

\- LiveKit for WebRTC voice transport / SFU



**## Infrastructure**



\- Docker Compose

\- Linux server



Do not implement a custom SFU.



Do not introduce Redis unless it is later proven necessary.



**---**



**# 3. Complete Product Scope**



**## 3.1 User Accounts**



The application supports:



\- Registration

\- Login

\- Logout

\- Globally unique usernames

\- Password authentication

\- Short-lived access tokens

\- Refresh tokens

\- Refresh token rotation

\- Session management

\- Persistent user settings



There is no email verification in the planned product.



There is no OAuth in the planned product.



**---**



**## 3.2 Global Text Chat**



The application supports a global realtime text chat.



Requirements:



\- Realtime message delivery

\- Message history

\- Message timestamps

\- Username associated with messages

\- Authenticated users can send messages

\- Authenticated users can receive messages

\- WebSocket-based realtime delivery

\- PostgreSQL-backed message history



The initial MVP has one global text chat.



**---**



**## 3.3 Public Voice Rooms**



The application supports multiple predefined public voice rooms.



Requirements:



\- Multiple voice rooms

\- Rooms are predefined by the server

\- Users can join a room

\- Users can leave a room

\- Users can see participants

\- Speaking indicator

\- Mute/unmute

\- Voice activity state

\- LiveKit-based WebRTC transport



Users cannot create arbitrary rooms in the initial product design.



Private voice rooms are not part of the initial MVP.



**---**



**## 3.4 Group Calls**



The application supports group voice calls.



Group calls use LiveKit/WebRTC.



Requirements:



\- Multiple participants

\- Join/leave

\- Microphone mute/unmute

\- Speaking indicators

\- Participant state

\- Reliable realtime connection state

\- Server-issued LiveKit access tokens



LiveKit API secrets must never be sent to the client.



No custom SFU should be implemented.



**---**



**## 3.5 Audio Settings**



The client supports audio configuration.



Requirements:



\- Microphone selection

\- Microphone testing

\- Input level monitoring

\- Microphone mute/unmute

\- Output device selection where supported

\- Persisted audio settings

\- Configurable push-to-talk

\- Global mute/unmute hotkey



Do not assume arbitrary Windows output-device control from browser APIs.



Microphone enumeration/testing/input-level functionality should use Electron/Chromium Web APIs where supported.



**---**



**## 3.6 Push-to-Talk**



The application supports configurable PTT.



Important implementation rule:



Electron \`globalShortcut\` alone does NOT implement true hold-to-talk.



A global toggle mute/unmute can use \`globalShortcut\`.



True hold-to-talk requires key-down/key-up handling.



If a native Windows keyboard hook is required, treat it as a later implementation dependency and document it rather than pretending \`globalShortcut\` provides true PTT.



**---**



**## 3.7 User Settings**



The client supports persistent user settings.



Examples:



\- Microphone

\- Output device where supported

\- Input level/test settings

\- Push-to-talk key

\- Mute hotkey

\- Other client audio preferences



Settings should be stored according to the application's security and architecture requirements.



**---**



**# 4. Future Social Features**



The complete product may later include social functionality.



These features are NOT part of the current MVP unless a milestone explicitly enables them.



**## Friends**



Potential functionality:



\- Send friend request

\- Accept friend request

\- Reject friend request

\- Remove friend

\- Friend list

\- Online/offline status

\- Presence

\- User lookup



**## Private Messages**



Potential functionality:



\- One-to-one private conversations

\- Private message history

\- Realtime private messages

\- Conversation list

\- Read/unread state where required



**## Private Calls**



Potential functionality:



\- One-to-one voice calls

\- Group/private voice calls

\- Incoming call state

\- Outgoing call state

\- Accept/reject

\- Hang up

\- Participant state

\- Mute/unmute



These future features must not be implemented until explicitly included in the current milestone.



**---**



**# 5. Authentication and Security**



**## Passwords**



Passwords must use Argon2id.



Never store plaintext passwords.



**## Access Tokens**



Access tokens are short-lived.



**## Refresh Tokens**



Refresh tokens must:



\- Be cryptographically random

\- Never be stored plaintext in the database

\- Be stored only as deterministic secure hashes

\- Support lookup by deterministic hash

\- Be rotated on refresh

\- Revoke the previous token after successful rotation

\- Be revoked on logout



Do not use salted password-style Argon2 hashes when deterministic lookup is required for refresh tokens.



**## Client Security**



Do not store long-lived authentication secrets in localStorage.



**## Production Security**



\- HTTPS/WSS in production

\- PostgreSQL must not be publicly exposed

\- LiveKit API secrets never reach the client

\- Secrets come from environment variables

\- Protected API endpoints require authentication

\- Validate external input

\- Use parameterized SQL queries



**---**



**# 6. Database**



PostgreSQL must support the complete product architecture.



Core entities include:



\- Users

\- Authentication/session data

\- Refresh-token/session records

\- Predefined voice rooms

\- Chat messages

\- User settings



Future entities may include:



\- Friend relationships

\- Friend requests

\- Private conversations

\- Private messages

\- Call/session metadata



Database schema must evolve through migrations.



All SQL queries must be parameterized.



Database credentials and connection strings must come from environment variables.



PostgreSQL must not be publicly exposed in production.



Do not add Redis unless proven necessary.



**---**



**# 7. API**



REST is used for:



\- Registration

\- Login

\- Logout

\- Token refresh

\- User/settings operations

\- Chat history

\- Application configuration

\- Other request/response operations



WebSocket is used for:



\- Realtime chat

\- Presence

\- Realtime events

\- Participant state

\- Other realtime application events



LiveKit is used for:



\- Voice media transport

\- Voice room connections

\- Group voice calls



Do not use WebSocket as a replacement for LiveKit media transport.



**---**



**# 8. Voice Architecture**



LiveKit is the WebRTC transport/SFU.



The backend is responsible for issuing appropriate LiveKit credentials/tokens.



The client connects to LiveKit directly for media transport.



LiveKit API secrets must never reach the client.



Do not implement a custom SFU.



**---**



**# 9. Architecture Rules**



Repository structure:



\- client/

\- server/

\- shared/

\- infrastructure/



Use TypeScript.



Use npm workspaces.



Keep client, server and shared code clearly separated.



Preserve the documented architecture.



Do not introduce new infrastructure without a demonstrated requirement.



Do not redesign working architecture without a concrete reason.



**---**



**# 10. Milestone Rules**



The complete product scope above describes the destination.



Implementation must happen milestone by milestone.



Only implement functionality explicitly authorized by the current task.



Do not implement future milestones early.



A task may explicitly authorize fixing existing code from an earlier milestone when required to restore the project to a working state.



**## Current implementation order**



Follow the roadmap defined in:



docs/roadmap.md



The exact current milestone always takes precedence over assumptions.



**---**



---

# 10.1 Current Project Status / Handoff

The repository has progressed beyond the original MVP-only description in this document. This section records the actual state at the end of the latest development session and is authoritative for handoff to the next agent session.

## Completed and implemented

The following functionality is implemented and was previously verified:

- User registration, login, logout, refresh-token rotation and session restoration.
- Global realtime text chat with PostgreSQL-backed history.
- Presence / online-offline state.
- Predefined public LiveKit voice rooms.
- Voice participants and speaking indicators.
- Microphone mute/unmute.
- Global `Ctrl+Shift+M` mute toggle.
- Friends/social functionality:
  - user search;
  - friend requests;
  - accept/reject;
  - friend list/removal;
  - presence.
- One-to-one private messages:
  - conversation persistence;
  - bounded history;
  - realtime delivery;
  - participant authorization / IDOR protection.
- Electron desktop client with React/TypeScript.
- Secure refresh-session storage using Electron `safeStorage`.
- Electron IPC/main-frame and microphone permission hardening.
- Desktop UX foundation:
  - Discord-like workspace layout;
  - navigation for Friends, Requests, DMs, global chat and voice rooms;
  - current voice area;
  - settings shell;
  - loading/empty/error/reconnecting/connected/offline states;
  - unread indicators.
- Initial screen-sharing implementation using Electron screen/window capture selection and LiveKit screen-share publishing.
- Screen sharing is designed to coexist with microphone/voice and to clean up when sharing stops or the voice session ends.

## Latest verification status

The latest development session verified:

- TypeScript/build succeeded after fixing implementation errors.
- Automated test suite was run and reported green.
- Local Docker backend/LiveKit environment was used for validation.
- Two isolated Electron clients were launched against the local environment.
- GUI navigation/auth/presence and parts of the Friends/DM flow were exercised.
- The previous session was interrupted before completing all planned GUI validation.

Important: **Screen sharing has NOT yet been fully verified end-to-end through two real Electron clients.**

The next agent must not claim screen sharing is fully verified until it actually checks:

1. client A starts sharing a screen/window;
2. client B receives and visibly renders the shared track;
3. client A stops sharing;
4. the shared track disappears from client B;
5. leaving/rejoining voice does not leave stale screen-share state;
6. microphone/voice functionality remains intact while screen sharing is active;
7. capture-ending cleanup is handled correctly.

The private-message GUI smoke test was also not fully completed in the interrupted session. Do not assume it passed solely because the backend/tests passed.

## Known unfinished functionality

The following are intentionally not complete unless explicitly marked otherwise by a later status document:

- Full audio settings:
  - microphone selection;
  - microphone test;
  - input-level monitoring;
  - output-device selection where supported;
  - persisted audio preferences.
- True configurable push-to-talk with reliable key-down/key-up handling.
- Private voice calls / incoming and outgoing call UX.
- Group/private call UX beyond the existing public voice-room functionality.
- Windows production installer/distribution packaging.
- Self-hosted guided installer / update / backup / restore workflow.
- Video, file sharing, bots, streaming, payments and subscriptions remain out of scope.

## Development-session rules

For the current handoff:

- Do not modify production.
- Do not deploy.
- Do not create a Git commit or push unless the user explicitly requests it.
- Preserve all existing uncommitted work.
- Verify before claiming completion.
- Update `docs/development-status.md` with the final verified state when completing the current milestone.
- Update relevant documentation when the current task explicitly requests documentation updates.

## Recommended immediate next step

Continue the Desktop UX + Screen Sharing milestone only until validation is complete:

1. Inspect current Git status/diff and existing documentation.
2. Run the full test suite and build again.
3. Complete the local two-client Electron GUI smoke test.
4. Specifically complete the screen-sharing end-to-end verification listed above.
5. Verify/record the private-message GUI smoke status without overstating it.
6. Update `AGENTS.md`, relevant `docs/*`, `README.md` if needed, and create/update `docs/development-status.md`.
7. Stop before production deployment, commit, or push.

After this milestone is genuinely verified, follow `docs/roadmap.md` for the next feature milestone.

---


**# 11. Future Feature Restrictions**



Unless explicitly requested by the current task, do not implement:



\- Friends

\- Friend requests

\- Private messages

\- Private conversations

\- Private calls

\- Additional social systems

\- WebSocket chat before its milestone

\- LiveKit integration before its milestone

\- Electron UI before its milestone

\- PTT native hooks before their milestone

\- Video

\- Screen sharing

\- File sharing

\- Bots

\- Streaming

\- Payments

\- Subscriptions

\- Complex RBAC

\- Redis

\- Unrelated infrastructure



Do not create placeholder implementations of future features merely because they are described in this document.



**---**



**# 12. File Safety**



\- Modify only files required by the current task

\- Do not modify unrelated files

\- Do not delete existing project files unless explicitly required

\- Do not overwrite documentation unless explicitly instructed

\- Preserve existing work

\- Do not use destructive cleanup commands

\- Do not access directories outside the project

\- Use relative project paths for file operations

\- Do not use PowerShell Set-Content for project files

\- Use proper project editing tools



**---**



**# 13. Documentation**



Documentation in docs/ represents approved architectural decisions.



Relevant documentation includes:



\- docs/architecture.md

\- docs/database.md

\- docs/api.md

\- docs/realtime.md

\- docs/voice.md

\- docs/audio.md

\- docs/client.md

\- docs/deployment.md

\- docs/testing.md

\- docs/roadmap.md



Agents must read relevant documentation before modifying the corresponding subsystem.



Do not modify documentation unless:



1\. explicitly requested, or

2\. the task specifically requires correcting demonstrably incorrect documentation.



**---**



**# 14. Git Rules**



Do not create Git commits unless explicitly requested.



Before modifying the project:



\- inspect Git status

\- preserve existing user changes

\- do not reset unrelated changes

\- do not discard uncommitted work



After implementation:



\- inspect Git diff

\- verify only expected files changed



**---**



**# 15. Verification**



After implementation:



\- run the appropriate build

\- run relevant tests

\- fix failures caused by the implementation

\- rerun tests

\- verify TypeScript compilation

\- inspect Git diff

\- report exactly what was changed

\- report commands executed

\- report test/build results



Do not claim a task is complete without actually verifying it.

## 10.2 Desktop UX + Screen Sharing continuation status (2026-10-04)

- Local final validation passed: 37 server tests passed, 3 server tests skipped, 18 client tests passed; `npm.cmd run build` and `git diff --check` passed.
- Root cause and fix: Electron routes desktop video acquisition through media permission callbacks, including an empty media type list. The previous handler rejected that request before the selected desktop source could reach the display-media handler. `client/src/main/security.ts` now narrowly authorizes trusted main-frame audio and selected desktop capture; regression tests cover missing selection, mixed types, and untrusted frames.
- Two visible local Electron clients verified actual full-screen and application-window video on the remote client. The decoded frames were visually inspected, non-green/non-black, and changed with the source content. Cancel, stop, leave while sharing, and rejoin without stale state were verified. External source-window closure was not separately tested.
- Local GUI covered Friends search/request/accept/presence, bidirectional realtime DMs and history after reload, unread clearing, global chat/unread, navigation, settings while connected, voice participants/speaking, and microphone controls. The Ctrl+Shift+M callback registered without an Electron warning, but the Windows synthetic key attempt did not toggle the mic; treat end-to-end hotkey verification as unresolved. Loading/error/reconnecting/offline variants and a third-account GUI authorization attempt were not exhaustive.
- Windows Codex helper ACL failure and exact safe ACL repair, plus separate-profile launch/CDP recovery, are documented in `docs/testing.md`.
- The verified local source was SCP-transferred and deployed to `/opt/community-chat` using the documented production Compose overlay. All four production containers are running; PostgreSQL is healthy; migrations completed; HTTPS health returned `{"status":"ok"}` and LiveKit returned `OK`. Two production Electron clients verified registration, presence, friend request/accept, global chat/unread, DM unread/delivery, two-participant LiveKit voice, microphone UI mute/unmute, actual 960x540 desktop content on the remote client, and stop cleanup. The production video was visually inspected and was not green/black.
- No commit or push was made. See `docs/development-status.md` for exact results and remaining limitations.
