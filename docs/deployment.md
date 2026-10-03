# Development and Deployment Guide

This guide describes the capabilities present in this repository. The current Electron build is unpackaged, and the Compose file does not configure the TLS edge or all public LiveKit networking needed for production; do not treat it as a finished installer or complete production deployment recipe.

## Architecture

- **PostgreSQL** stores accounts, sessions, fixed voice-room records, and global chat history. Compose persists its data in the named `postgres_data` volume.
- **Backend API** is an Express/TypeScript process. It serves REST on port 3000 and authenticated chat/presence WebSockets at `/ws/chat`. It connects to PostgreSQL and applies migrations during startup.
- **LiveKit** runs the voice signaling and WebRTC SFU service. The backend signs short-lived participant tokens; the Windows client connects directly to LiveKit for audio.
- **Electron/React client** runs on Windows during development. Its main process calls the backend REST API and stores the refresh token in Electron `safeStorage`; the renderer uses the chat WebSocket and LiveKit client. `LIVEKIT_API_SECRET` stays on the server.

For local development, Docker Compose runs PostgreSQL, the backend, and LiveKit. Electron/React runs directly on Windows so it can use the local desktop, microphone, and global mute shortcut. The client defaults to `http://localhost:3000`; the local voice token response uses the configured `LIVEKIT_URL`.

## Prerequisites

- Windows 10/11 for the desktop client.
- Node.js 20.x and npm (the server image uses Node `20.19.5`; use a current Node 20 LTS installation for a matching development runtime).
- Docker Desktop with the **Linux container engine** enabled and Docker Compose v2 (`docker compose`).
- Git, PowerShell, and network access to install npm packages and pull container images.

## Local development

Run commands below from the repository root in PowerShell.

### 1. Install and configure

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env`. Compose requires these values:

| Variable | Local development value |
| --- | --- |
| `POSTGRES_PASSWORD` | Choose a local database password. |
| `JWT_SECRET` | Generate a random secret (command below). |
| `LIVEKIT_URL` | Keep `ws://localhost:7880` so the desktop client can reach local LiveKit. |
| `LIVEKIT_API_KEY` | Local key identifier; the example `devkey` is suitable only for local development. |
| `LIVEKIT_API_SECRET` | Generate a random secret (command below). |

Generate a value with Node.js, and use separate output for each secret:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

The root `.env.example` is the Compose template. `server/.env.example` is for running the server directly and shows its `DATABASE_URL` option. Compose sets the standard `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, and `PGPASSWORD` variables on the server; the `pg` library uses these when no connection string is supplied. The Compose database connection is therefore configured by those mapped variables.

### 2. Start and inspect the backend stack

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml up --build -d
docker compose --env-file .env -f infrastructure/docker-compose.yml ps
```

`postgres` has a Docker health check. `server` and `livekit` do not have container health checks. Probe the API separately:

```powershell
Invoke-RestMethod http://localhost:3000/health
```

The backend connects to its database and runs the migration files at startup. Inspect the migration and service logs:

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml logs --tail=200 postgres server livekit
```

Do not assume the API is ready solely because the container is running; check `/health` and look for successful migration completion in the server logs.

### 3. Start the Windows client

In another PowerShell window:

```powershell
npm run dev:client
```

The Electron window connects to `http://localhost:3000` by default and derives the chat WebSocket URL from that API URL. The development renderer binds to IPv4 loopback (`127.0.0.1`) to avoid Windows `localhost` IPv4/IPv6 resolution mismatches between Vite and Electron. LiveKit connection details come from the backend's voice-token response. Register/sign in, use the global chat, and choose one of the fixed public voice rooms.

To point the source client at another API while developing, set the main-process environment before starting Electron:

```powershell
$env:COMMUNITY_CHAT_API_URL = 'https://chat.example.com'
npm run dev:client
```

The remote backend must itself return a reachable `LIVEKIT_URL`; for TLS deployments use a `wss://` LiveKit URL.

### 4. Stop, rebuild, test, and build

Stop containers while retaining the PostgreSQL volume:

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml down
```

Rebuild and recreate after server, migration, or Compose changes:

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml up --build -d
```

Run the repository's tests and production TypeScript/Electron build:

```powershell
npm test
npm run build
```

`npm run build` builds the backend/shared package and the Electron/Vite client. For the client alone use `npm run build:client`; for the server alone use `npm run build:server`.

## Windows desktop client build and distribution

Build the Electron/Vite output with:

```powershell
npm run build:client
```

The generated files are under `client/out/` (`main`, `preload`, and `renderer`). This command compiles the client but does **not** create an installer, standalone `.exe`, or packaged/unpacked Electron application. There is no electron-builder, Electron Forge, or other packaging configuration in the repository. The `client/out` directory by itself is not a supported distributable for another Windows user.

You can run the built output locally for verification because `client/package.json` points Electron at `out/main/index.js`. After building, run from the repository root:

```powershell
Push-Location client
npm exec -- electron .
Pop-Location
```

Close the Electron window to return to PowerShell. This runs the local build using the installed Electron runtime; it is not an installer or a redistributable package.

Therefore, this repository currently has no Windows artifact that can be handed to users as an installed desktop client. A later packaging task would need to add and configure a packager, Windows target/installer settings, application metadata/icon, and production API configuration, then build and test the packaged artifact on Windows. No packaging system is added by this guide.

## Self-hosted production server

### Supported architecture and current limitations

The intended deployment is a Linux host running PostgreSQL, the Node backend, and LiveKit in Compose, with a public TLS reverse proxy in front of the API/WebSocket and LiveKit signaling endpoints. PostgreSQL should remain on the private Compose network. Windows Electron clients connect to the public API and LiveKit endpoints.

The existing Compose file is a local-development stack, not a complete production deployment recipe:

- It publishes backend port 3000 and LiveKit ports 7880/TCP, 7881/TCP, and 7882/UDP directly. It has no reverse proxy or TLS configuration.
- It uses fixed database name/user values and maps the password into the standard `PG*` variables that the server's `pg` client reads. A production deployment should review these defaults and keep the database reachable only on the private Compose network.
- `LIVEKIT_URL` defaults to `ws://localhost:7880`, which is only suitable for a client on the same machine. Production clients need a public `wss://` LiveKit signaling URL reachable through the chosen DNS and TLS setup.
- LiveKit public/NAT and TURN configuration is not supplied by this Compose file. Validate media connectivity for the target network before production use.
- Only PostgreSQL has a Compose health check; the API's `/health` endpoint is an HTTP check, not a configured container health check.

### DNS, TLS, and network

Use public DNS names for the API (for example `chat.example.com`) and LiveKit signaling (for example `voice.example.com`). Configure a reverse proxy/load balancer with valid TLS certificates to route HTTPS API requests and WebSocket upgrades (`/ws/chat`) to the backend, and LiveKit WebSocket signaling to LiveKit. Configure the LiveKit deployment for its advertised public address and media network; the current Compose file maps 7881/TCP and 7882/UDP. Follow the selected LiveKit/reverse-proxy deployment's requirements for additional relay/TURN ports if needed.

Clients must use HTTPS/WSS in production. Do not publish PostgreSQL port 5432 to the public network. Restrict host firewall ingress to the required TLS and LiveKit media ports. The existing Compose file maps LiveKit signaling 7880/TCP, media TCP 7881/TCP, and media UDP 7882/UDP; it does not configure a reverse proxy or certificates.

### Production environment and secrets

Use the root `.env.example` as the starting list, but replace all sample values. Generate independent high-entropy values for `POSTGRES_PASSWORD`, `JWT_SECRET`, and `LIVEKIT_API_SECRET` with a cryptographic generator such as:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Set `LIVEKIT_API_KEY` to a deployment-specific key identifier and `LIVEKIT_URL` to the public client-reachable `wss://voice.example.com` endpoint. The current Compose file uses `POSTGRES_PASSWORD` for the PostgreSQL service and maps it to the backend as `PGPASSWORD`; the database host/name/user are currently fixed in Compose. Never put LiveKit API secrets in the desktop client. Keep `.env` out of version control and limit access to it on the server.

### Compose lifecycle commands

After adding the deployment's TLS/network configuration and reviewing the database defaults, the existing stack can be operated with these repository commands from the project root on the Linux host:

```sh
docker compose --env-file .env -f infrastructure/docker-compose.yml config
docker compose --env-file .env -f infrastructure/docker-compose.yml up --build -d
docker compose --env-file .env -f infrastructure/docker-compose.yml ps
docker compose --env-file .env -f infrastructure/docker-compose.yml logs --tail=200 postgres server livekit
curl --fail https://chat.example.com/health
docker compose --env-file .env -f infrastructure/docker-compose.yml restart
docker compose --env-file .env -f infrastructure/docker-compose.yml pull
docker compose --env-file .env -f infrastructure/docker-compose.yml up --build -d
docker compose --env-file .env -f infrastructure/docker-compose.yml down
```

The Compose server runs migrations as part of backend startup after connecting to PostgreSQL; check logs for `All migrations completed successfully`. The named `postgres_data` volume preserves database data across `down` and container recreation. Do not use `down -v` for routine updates. Configure and test a separate database backup and restore process; a Docker volume alone is not a backup.

`docker compose config` validates Compose syntax and interpolation, but does not prove the API can connect to PostgreSQL, that migrations succeed, or that external media traffic works. Check `/health` and logs after every deployment/update.

### Configure a Windows client for production

The client main process reads `COMMUNITY_CHAT_API_URL` and defaults to `http://localhost:3000`. For source development against a production-like server:

```powershell
$env:COMMUNITY_CHAT_API_URL = 'https://chat.example.com'
npm run dev:client
```

The WebSocket endpoint is derived from this API URL (`wss://chat.example.com/ws/chat`). The LiveKit address is returned by the backend and is configured through the server's `LIVEKIT_URL`. There is currently no packaged Windows client and no build-time client API configuration or installer workflow. Setting the environment variable for `npm run build:client` does not produce a configured distributable; a future packaging/configuration implementation must define how this value is set securely for installed clients.

## Production security checklist

- [ ] Use unique, cryptographically strong database, JWT, and LiveKit secrets; rotate them if exposed.
- [ ] Serve API and WebSocket traffic over HTTPS/WSS and LiveKit signaling over WSS with valid certificates.
- [ ] Keep PostgreSQL private; do not expose port 5432 publicly.
- [ ] Keep LiveKit API credentials and `.env` on the server; never commit secrets.
- [ ] Persist PostgreSQL data and maintain tested off-host backups and a recovery procedure.
- [ ] Allow only required ports through the firewall; validate LiveKit's TCP/UDP/NAT and relay requirements for the host network.
- [ ] Configure Windows clients with the public HTTPS API URL and ensure the server returns the public WSS LiveKit URL.
- [ ] Preserve the existing short-lived access-token, rotated/revocable refresh-token, and Electron `safeStorage` session design; protect machine accounts and sign out on shared devices.
- [ ] Verify migration logs, API health, and voice connectivity after deployment and updates.
