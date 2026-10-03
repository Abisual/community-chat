# Development Status

## Desktop UX + Screen Sharing continuation

Date: 2026-10-04

### Local automated validation

- Final `npm.cmd test`: passed. Server Jest reported 37 passed and 3 skipped; client Vitest reported 18 passed.
- Final `npm.cmd run build`: passed for shared, server, and Electron client.
- Final `git diff --check`: passed; Git printed only line-ending conversion warnings.
- Local Docker Compose/PostgreSQL/LiveKit were available for the GUI run.

### Desktop UX and social GUI verification

- Two real visible Electron clients used separate profiles (`out/gui-smoke-a`, `out/gui-smoke-b`) and separate DevTools ports. Each authenticated as a different test user.
- Verified user search, friend request and acceptance, online presence, bidirectional realtime DMs, DM history after reload, DM unread indication/clearing, global chat send/history/unread clearing, navigation across Friends/Requests/DMs/global chat/voice/Settings, and Settings navigation while voice remained connected.
- Both clients joined General Chat. The room showed two participants and Connected state. Client B saw the speaking indicator during speech. Mic UI mute/unmute was exercised; the hotkey and all transient loading/error/reconnecting/offline UI variants were not exhaustively verified.
- A third-user GUI authorization attempt was not performed in this run; rely on the existing API authorization tests for that boundary.

### Screen sharing

- Root cause: Electron delivered the chosen desktop video permission through its session media permission callbacks; one request had an empty `mediaTypes` list. The pre-fix handler rejected it before the display-media handler could pass the selected desktop source to `getUserMedia`.
- Fix: main-process media permission checks now permit only trusted main-frame audio requests, a selected video request, or Electron's empty-media-type capture request while a valid selected source is pending. The display-media authorization remains constrained by trusted main frame, trusted renderer URL, video request, user gesture, and current source selection. Regression tests cover selected and missing sources plus untrusted/mixed requests.
- Full-screen capture: client A selected Screen 1. Client B rendered an actual 960x540 desktop video with nonuniform visible Windows UI content; it was visually inspected and showed neither a solid green nor black frame. Navigating A changed the image observed on B.
- Window capture: A selected its Community Chat application window. B rendered a 583x386 video of the actual app window, and navigation in A changed the content on B.
- Lifecycle: Cancel left capture stopped; Stop sharing removed the remote video; leaving A's voice while sharing removed its participant and share from B; rejoining A restored the participant without stale share state. Microphone remained available in the active voice UI alongside screen sharing.
- External capture-source closure was not separately exercised. Ctrl+Shift+M registered without an Electron warning, but the Windows synthetic key input did not toggle the microphone; end-to-end hotkey behavior remains unconfirmed. Mic UI controls were available and used.

### Windows development/automation recovery

- The Windows helper failed with `helper_sandbox_lock_failed` and `SetNamedSecurityInfoW sandbox dir failed: 5`. Inspection identified restrictive ACLs on `%USERPROFILE%\.codex\.sandbox-bin` that prevented helper initialization from adjusting the directory security descriptor.
- An elevated, directory-scoped ACL grant to the signed-in user and SYSTEM allowed shell initialization intermittently. Do not grant unrestricted ACL rights to the restricted sandbox identity or modify parent Codex directories.
- CUA/Node automation still exited on the same lock error, so a temporary local Node/CDP harness controlled the actual visible Electron pages on ports 9331/9332. Exact ACL recovery and separate-profile launch commands are documented in `docs/testing.md`.

### Production

- The reviewed local archive was SCP-transferred to `/root/community-chat-source.tar.gz` and extracted over `/opt/community-chat`. Archive creation excluded `.git`, dependencies, build output, and `.env*`; `/etc/community-chat/production.env` was neither copied nor printed.
- Production was rebuilt with the documented Compose files and existing production env file. PostgreSQL, server, LiveKit, and Caddy containers are running; PostgreSQL reports healthy. All six migrations completed. HTTPS `/health` returned `{"status":"ok"}` and the LiveKit HTTPS probe returned `OK`.
- Two isolated production Electron clients registered separate smoke accounts. Presence showed both online; a friend request was sent and accepted; an A-to-B DM appeared as unread and rendered when B opened the conversation. Global chat delivered an A-to-B message and showed/cleared B's unread badge. Both clients joined General Chat and saw two connected participants. The microphone UI mute/unmute button was exercised while connected.
- Production screen-share test: A selected Screen 1; B displayed an actual decoded 960x540 desktop stream (`readyState=4`, not paused). The captured renderer image was visually inspected and showed real changing desktop/UI content with no solid green or black frame. Stopping sharing removed B's video and active-share state.
- Production window capture, production microphone mute, reply direction, logout/session restoration after restart, and the Ctrl+Shift+M hotkey were not separately tested. The first HTTPS probe immediately after restart returned 502 while the server was starting; after readiness, health and LiveKit probes passed. Production is updated, with the above smoke-test scope and limitations.

### Git handoff

- Branch: `master`; inspected HEAD: `e0c7d46` (`feat: add friends and private messaging`).
- Existing uncommitted milestone work was preserved. No commit or push was made.
- Remaining verification limitations: end-to-end Ctrl+Shift+M, external source closure, transient loading/error/reconnecting/offline GUI states, third-user GUI authorization, and production window/mic mute cases.
