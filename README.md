# Community Chat Application

A self-hosted global text chat and public voice-room application with a Windows Electron client.

## Repository layout

- `client/`: Electron main/preload processes and React renderer.
- `server/`: Express API, authenticated chat WebSocket, PostgreSQL migrations, and LiveKit token issuance.
- `shared/`: shared TypeScript definitions.
- `infrastructure/`: Docker Compose configuration for PostgreSQL, backend, and LiveKit.
- `docs/`: architecture, API, realtime, database, testing, and deployment guides.

## Get started

Use Node.js 20.x/npm, Windows 10/11, and Docker Desktop with its Linux engine enabled. From PowerShell at the repository root:

```powershell
npm ci
Copy-Item .env.example .env
```

Edit `.env` with local secrets, then start the backend services:

```powershell
docker compose --env-file .env -f infrastructure/docker-compose.yml up --build -d
docker compose --env-file .env -f infrastructure/docker-compose.yml ps
Invoke-RestMethod http://localhost:3000/health
```

Start the Electron client in another window:

```powershell
npm run dev:client
```

Compose maps the PostgreSQL settings into the standard `PG*` variables used by the server's PostgreSQL driver. See [the development and deployment guide](docs/deployment.md) for required configuration, verification, tests, build steps, current Windows packaging limitations, and production constraints.

## Tests and build

```powershell
npm test
npm run build
```
