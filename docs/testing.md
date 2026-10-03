# Testing

## Overview

Testing strategy for the application follows established practices for both backend and frontend components.

## Backend Testing

- Unit tests for API endpoints using Jest
- Integration tests for database interactions
- Mock external services like LiveKit for isolated testing
- Security tests for authentication flows
- WebSocket tests for chat authentication, persistence/broadcast, presence, and input validation
- Performance tests for WebSocket connections

## Frontend Testing

- Component tests using React Testing Library
- End-to-end tests for user flows
- Browser-based audio functionality testing
- Integration tests for WebSocket connections

## Test Environment

- Separate test databases for CI/CD pipeline
- Isolated environment for all test runs
- Automated test execution in continuous integration
- Test coverage reporting with code coverage tools

For local PostgreSQL/LiveKit integration tests, provide `DATABASE_URL`, `TEST_DATABASE_URL`, `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` to the host-side Jest process, using the local root `.env` and Compose database settings. Host-side Jest does not inherit variables from the Docker Compose server container.

## Testing Constraints

- No complex RBAC testing (MVP focus)
- Limited to core communication features
- Focus on authentication, chat, and voice functionality

## Current Desktop UX and screen-sharing verification

- Run `npm.cmd test` and `npm.cmd run build` from the repository root.
- Desktop capture must be verified with two visible Electron processes, separate persisted profiles, and the local Docker backend/LiveKit. For example, from `client/`:

  ```powershell
  .\node_modules\.bin\electron.cmd --remote-debugging-port=9331 --remote-allow-origins=* --user-data-dir=out/gui-smoke-a .
  .\node_modules\.bin\electron.cmd --remote-debugging-port=9332 --remote-allow-origins=* --user-data-dir=out/gui-smoke-b .
  ```

  Keep `--user-data-dir` before the application path (`.`); otherwise Electron may treat it as an app argument and reuse the default profile. Sign in as different users in each client.
- In the 2026-10-04 local smoke run, a permission-handler mismatch was fixed: Electron reported display-capture permission through the media permission callbacks with an empty media-type list, while the previous authorization rejected that request before the display-media handler could provide the selected desktop source. The main process now narrowly authorizes trusted main-frame audio, and video/empty-type media requests only while a valid picker selection is pending. The display-media handler still requires a trusted main frame, video request, user gesture, and selected source.
- Two-client GUI verification observed decoded 960x540 full-screen video and 583x386 application-window video on client B. Both showed the actual desktop/application content, changed when client A navigated, and were not solid green or black. Stopping sharing and leaving voice removed the remote tile; rejoining showed no stale share. The picker listed screens and application windows, and Cancel left capture stopped.
- Friends request/accept, presence, bidirectional realtime DMs, history after reload, DM/global unread clearing, global chat, navigation, settings while connected, and the voice room participant state were exercised. Automated tests remain necessary for authorization boundaries; do not infer a third-account GUI authorization test from these checks.

### Windows Codex sandbox and GUI automation recovery

- The recurring `helper_sandbox_lock_failed` / `SetNamedSecurityInfoW sandbox dir failed: 5` was traced to a protected ACL on `%USERPROFILE%\.codex\.sandbox-bin`: the current account could not update the ACL needed when the helper initialized. Elevation granted Full Control to the signed-in account and `NT AUTHORITY\SYSTEM` on that exact helper directory; the sandbox then started, though this session observed the error recur intermittently. Repair only that directory, do not grant Full Control or `WRITE_DAC` to `CodexSandboxUsers` or other restricted sandbox identities, and do not alter parent `.codex` ACLs.
- If the helper error recurs, use elevated PowerShell for the narrow ACL repair (substitute the current signed-in account automatically):

  ```powershell
  $path = Join-Path $env:USERPROFILE '.codex\.sandbox-bin'
  $user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  icacls.exe $path /grant "$($user):(OI)(CI)F" 'NT AUTHORITY\SYSTEM:(OI)(CI)F'
  ```

- If CUA/Node automation exits with the same sandbox error, the Electron clients can still be inspected through Chromium DevTools Protocol on ports 9331/9332, using a trusted local Node process with the built-in WebSocket client. Preserve the separate profiles and launch argument ordering shown above. Do not claim visual behavior from DOM state alone: inspect the remote `<video>` dimensions/playback state and capture/visually inspect its rendered content.
- In this environment, CUA's Node runtime continued to exit even after the narrow ACL repair, so the CDP route was used to complete the actual visible two-client test. A future failure should be diagnosed from the helper error first; it is not evidence that Electron or LiveKit is unavailable.

### Production smoke result (2026-10-04)

- The local archive was transferred by SCP and deployed with the existing production Compose overlay. Four expected containers were running, PostgreSQL was healthy, migrations completed, HTTPS `/health` returned `{"status":"ok"}`, and the LiveKit HTTPS probe returned `OK`.
- Two isolated production Electron clients verified account registration, online presence, friend request and acceptance, DM unread plus delivery, and a shared two-participant voice room.
- A selected real desktop source produced a decoded 960x540 video on the second client. The remote rendered screenshot showed the real desktop and was not a green/black frame. Stop sharing cleared the remote video. Production window capture and microphone mute/hotkey were not separately tested.
