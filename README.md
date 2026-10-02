# Community Chat Application

A self-hosted voice and text communication application for small communities.

## Project Structure
- **client/**: Windows Desktop Client (Electron + React)
- **server/**: Application Server (Node.js + Express)  
- **shared/**: Shared TypeScript packages
- **infrastructure/**: Docker configurations and deployment files
- **docs/**: Documentation

## Prerequisites
- Node.js 18+
- Docker and docker-compose
- Windows 10 or 11 (for client)

## Setup Instructions

### Install Dependencies
```bash
npm install
```

### Start PostgreSQL Database
```bash
cd infrastructure && docker-compose up -d postgres
```

### Run Database Migrations
```bash
cd server && npm run dev
```

### Start Backend Development Server
```bash
npm run dev:server
```

### Run Tests
```bash
npm test
```

## Environment Variables

Create a .env file with:
- PORT=3000
- DATABASE_URL=postgresql://user:password@localhost:5432/chat_db
- JWT_SECRET=your_jwt_secret_here

## Development Workflow
1. Run `npm run dev` to start all services in development mode
2. Backend server starts on port 3000  
3. Database runs via Docker using PostgreSQL
4. Tests verify application functionality

## Current Implementation Status

### Milestone 1: Repository Foundation and Backend/Database Foundation
- Monorepo with client, server, shared, infrastructure directories
- TypeScript configuration
- PostgreSQL database connection and migration system
- Basic server setup with /health endpoint  
- Initial database schema:
  - Users table
  - Voice rooms table (predefined public rooms)
  - Messages table
  - Sessions table for token management

### Next Milestones
- Authentication implementation
- WebSocket communication (chat/presence)
- LiveKit voice integration
- Electron client UI