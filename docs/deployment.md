# Development and Deployment Guide

This guide describes the capabilities present in this repository, including local development, an unpackaged Windows Electron build, and the self-hosted production deployment overlay. The repository does not create a Windows installer.

## Architecture

- **PostgreSQL** stores accounts, sessions, fixed voice-room records, and global chat history. Compose persists its data in the named `postgres_data` volume.
- **Backend API** is an Express/TypeScript process. It serves REST on port 3000 and authenticated chat/presence WebSockets at `/ws/chat`. It connects to PostgreSQL and applies migrations during startup.
- **LiveKit** runs the voice signaling and WebRTC SFU service. The backend signs short-lived participant tokens; the Windows client connects directly to LiveKit for audio.
- **Electron/React client** runs on Windows during development. Its main process calls the backend REST API and stores the refresh token in Electron `safeStorage`; the renderer uses the chat WebSocket and LiveKit client. `LIVEKIT_API_SECRET` stays on the server.

For local development, Docker Compose runs PostgreSQL, the backend, and LiveKit. Electron/React runs directly on Windows so it can use the local desktop, microphone, and global mute shortcut. The client defaults to `http://localhost:3000`; the local voice token response uses the configured `LIVEKIT_URL`.

## Prerequisites

- Windows 10/11 for the desktop client.
- Node.js 20.x and npm (the server image uses Node `20.19.5`; use a current Node 20 LTS installation for a matching development runtime).
- Docker Desktop with the **Linux container engine** enabled and Docker Compose v2 (`docker compose`). Production deployment overlays require Compose v2.24.4 or later for `!reset` and `!override` support.
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

The first deployment uses the existing Compose stack plus a production-only overlay and Caddy TLS edge, so local Compose behavior and its `ws://localhost:7880` default remain unchanged. Production overlays use Compose `!reset`/`!override` tags and require Docker Compose v2.24.4 or later ([Docker Compose merge reference](https://docs.docker.com/reference/compose-file/merge/)). The deployed host uses Docker Engine 29.8.2 and Docker Compose 5.6.0.

### VPS and endpoints

- Host: Ubuntu 26.04 LTS, x86_64, 1 vCPU, 1.6 GiB RAM, 50 GiB disk.
- Deployment checkout: `/opt/community-chat`.
- Production-only environment file: `/etc/community-chat/production.env`, mode `0600`, owned by root. It is outside the checkout and is never committed.
- API and chat WebSocket: `https://${PUBLIC_IP}` and `wss://${PUBLIC_IP}/ws/chat`.
- LiveKit signaling: `wss://${PUBLIC_IP}:8443`.

No domain was supplied. This deployment uses a publicly trusted Let's Encrypt IP certificate rather than inventing a DNS name. Let's Encrypt IP certificates use its short-lived profile (about 160 hours); Certbot 5.4+ supports requesting them, and the deployment's Certbot image is pinned to 5.8.0. The renewal timer below is required to keep this certificate valid. [Let's Encrypt IP certificate/profile details](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability), [Certbot IP certificate support](https://letsencrypt.org/2026/03/11/shorter-certs-certbot).

If a domain is added later, create A records for the API and LiveKit names pointing to the VPS public IP, change the Caddy site addresses and `LIVEKIT_URL`, then issue domain certificates before switching clients.

### Production environment

Create `/etc/community-chat/production.env` on the VPS only. It contains `PUBLIC_IP=<your VPS public IP>`, a production-only `POSTGRES_PASSWORD`, a production-only `JWT_SECRET`, a unique `LIVEKIT_API_KEY`, a production-only `LIVEKIT_API_SECRET`, and `LIVEKIT_URL=wss://<your VPS public IP>:8443`. Generate independent high-entropy secrets on the VPS. Do not copy developer `.env` values to it. Keep the file root-owned and mode `0600`. The database name/user (`community_chat_db` / `chat_user`) are currently configured in Compose; PostgreSQL has no published host port.

### Ports and firewall

| Port | Protocol | Use |
| --- | --- | --- |
| 22 | TCP | Existing SSH administration. |
| 80 | TCP | HTTP to HTTPS redirect and Let's Encrypt HTTP-01 validation/renewal. |
| 443 | TCP | HTTPS API and WSS chat WebSocket through Caddy. |
| 8443 | TCP | WSS LiveKit signaling through Caddy. |
| 7881 | TCP | LiveKit WebRTC TCP fallback. |
| 7882 | UDP | LiveKit's configured single UDP mux. |

The production overlay removes public mappings for backend 3000 and LiveKit signaling 7880. PostgreSQL 5432 remains private to the Compose network. No broad UDP media range or TURN port is opened: this deployment sets LiveKit's `rtc.udp_port: 7882` single-port mux and does not enable TURN. The VM initially had UFW inactive and no application listeners; Docker-published ports bypass UFW's normal filtering, so the host also installs a `DOCKER-USER` allowlist for the listed published ports and private bridge traffic. Check the VPS provider firewall separately if one is enabled.

The production Electron renderer uses `file://` when run from the built output. Its Content Security Policy permits HTTPS/WSS to configured remote hosts on explicit ports so the configurable LiveKit signaling endpoint at `:8443` can connect. Keep the client pointed at the trusted production API, and keep API secrets out of client configuration.

### Initial deployment and migrations

On the VPS, create the root-only production environment file, then run from `/opt/community-chat` using both Compose files:

```sh
cd /opt/community-chat
PUBLIC_IP=$(awk -F= '$1 == "PUBLIC_IP" { print $2; exit }' /etc/community-chat/production.env)
COMPOSE="docker compose -p community-chat --env-file /etc/community-chat/production.env -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.production.yml"
$COMPOSE config --quiet
$COMPOSE up --build -d postgres server livekit
```

Install the host firewall allowlist before starting the public proxy:

```sh
install -m 0644 infrastructure/community-chat-docker-firewall.service /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now community-chat-docker-firewall.service
iptables -S COMMUNITY-CHAT-INGRESS
```

PostgreSQL's Compose health check gates backend startup. The backend connects with the Compose `PG*` variables and runs the existing migrations at startup. Verify database, tables, and logs before starting the proxy:

```sh
$COMPOSE ps
$COMPOSE logs --tail=200 postgres server livekit
$COMPOSE exec -T postgres pg_isready -U chat_user -d community_chat_db
$COMPOSE exec -T postgres psql -U chat_user -d community_chat_db -Atc "SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename;"
```

Expected application tables include `users`, `sessions`, `voice_rooms`, `messages`, and `chat_messages`. Confirm the server log says `All migrations completed successfully`.

Issue the initial publicly trusted IP certificate while port 80 is free (Caddy is not started yet):

```sh
PUBLIC_IP=$(awk -F= '$1 == "PUBLIC_IP" { print $2; exit }' /etc/community-chat/production.env)
docker run --rm -p 80:80/tcp \
  -v /etc/letsencrypt:/etc/letsencrypt \
  -v /var/lib/letsencrypt:/var/lib/letsencrypt \
  -v /var/log/letsencrypt:/var/log/letsencrypt \
  certbot/certbot:v5.8.0 certonly --standalone \
  --preferred-profile shortlived --ip-address "$PUBLIC_IP" \
  --non-interactive --agree-tos --register-unsafely-without-email
```

Then start Caddy and verify the TLS API:

```sh
$COMPOSE up --build -d
$COMPOSE ps
curl --fail "https://${PUBLIC_IP}/health"
curl --fail "https://${PUBLIC_IP}:8443/"
$COMPOSE logs --tail=200 caddy server livekit postgres
```

Caddy terminates TLS and proxies API/WebSocket traffic to `server:3000` and LiveKit signaling to `livekit:7880` over the private Compose network. LiveKit advertises the host's public address and listens on TCP 7881/UDP 7882 as configured in the production overlay. Verify API health, healthy PostgreSQL, successful migrations, clean service logs, and an actual Electron voice join; container state alone is insufficient.

Install certificate renewal after the checkout is present:

```sh
install -m 0644 infrastructure/community-chat-cert-renew.service /etc/systemd/system/
install -m 0644 infrastructure/community-chat-cert-renew.timer /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now community-chat-cert-renew.timer
systemctl list-timers community-chat-cert-renew.timer
```

The timer checks every six hours. The script leaves Caddy online while the certificate has more than 24 hours remaining; when due, it briefly stops Caddy so standalone Certbot can validate on port 80, renews, then starts Caddy again. Inspect attempts with `journalctl -u community-chat-cert-renew.service`.

### Operations, backup, and rollback

From `/opt/community-chat`, define the same `COMPOSE` variable as above:

```sh
$COMPOSE ps
$COMPOSE logs --tail=200 postgres server livekit caddy
$COMPOSE restart server livekit caddy
curl --fail "https://${PUBLIC_IP}/health"
```

The database uses the named `community-chat_postgres_data` volume. Back it up regularly to protected storage outside the container; for example:

```sh
install -d -m 0700 /var/backups/community-chat
$COMPOSE exec -T postgres pg_dump -U chat_user community_chat_db > "/var/backups/community-chat/$(date +%F-%H%M%S).sql"
chmod 0600 /var/backups/community-chat/*.sql
```

Test restore procedures separately. Do not use `docker compose down -v` for routine operations. For application rollback, check out the prior known-good Git commit and run `$COMPOSE up --build -d`; migrations are forward-only in the current project, so rolling back application code does not reverse schema changes. Take a database backup before deployments that change migrations.

### Manual update workflow

Locally, run tests/build, commit, and push the intended branch. On the VPS:

```sh
cd /opt/community-chat
# The first post-push pull must move the temporary SCP copies out of the way.
BACKUP_DIR="/root/community-chat-scp-backup-$(date +%Y%m%d-%H%M%S)"
install -d -m 0700 "$BACKUP_DIR"
for file in infrastructure/Caddyfile infrastructure/community-chat-cert-renew.service infrastructure/community-chat-cert-renew.timer infrastructure/community-chat-docker-firewall.service infrastructure/docker-compose.production.yml infrastructure/docker-user-firewall.sh infrastructure/renew-ip-certificate.sh; do
  if [ -f "$file" ] && ! git ls-files --error-unmatch "$file" >/dev/null 2>&1; then
    mv "$file" "$BACKUP_DIR/"
  fi
done
if ! git pull --ff-only origin master; then
  for backup in "$BACKUP_DIR"/*; do
    [ -e "$backup" ] || continue
    mv "$backup" infrastructure/
  done
  exit 1
fi
for backup in "$BACKUP_DIR"/*; do
  [ -e "$backup" ] || continue
  cmp "$backup" "infrastructure/$(basename "$backup")"
done
PUBLIC_IP=$(awk -F= '$1 == "PUBLIC_IP" { print $2; exit }' /etc/community-chat/production.env)
COMPOSE="docker compose -p community-chat --env-file /etc/community-chat/production.env -f infrastructure/docker-compose.yml -f infrastructure/docker-compose.production.yml"
$COMPOSE config --quiet
$COMPOSE up --build -d
$COMPOSE ps
$COMPOSE logs --tail=200 postgres server livekit caddy
curl --fail "https://${PUBLIC_IP}/health"
```

The one-time backup keeps the temporary SCP copies available outside the checkout; compare them with the committed versions before relying on GitHub as the deployment source. The production environment file and database volume are not moved. The backend applies pending migrations on startup. Confirm PostgreSQL stays healthy, migration logs succeed, `/health` passes, and perform a production client smoke check. Keep the VPS checkout clean so later `git pull --ff-only` updates work normally.

### Windows Electron client against production

The client main process reads `COMMUNITY_CHAT_API_URL`. In PowerShell at the repository root, set the VPS address and API URL only for the client process, then start the existing Electron development client:

```powershell
$env:PUBLIC_IP = '<your VPS public IP>'
$env:COMMUNITY_CHAT_API_URL = "https://$env:PUBLIC_IP"
npm run dev:client
```

The client derives chat WSS from this API URL. Voice join obtains `wss://${PUBLIC_IP}:8443` from the backend's LiveKit token response. This leaves the local development default unchanged. The repository does not yet create a Windows installer.

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
