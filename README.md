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
`ash
npm install
`

### Start Backend Development Server
`ash
npm run dev:server
`

### Start PostgreSQL Database
`ash
cd infrastructure && docker-compose up -d postgres
`

### Run Tests
`ash
npm test
`

## Environment Variables

Create a .env file with:
- PORT=3000
- DATABASE_URL=postgresql://user:password@localhost:5432/chat_db
- JWT_SECRET=your_jwt_secret_here

## Development Workflow
1. Run 
pm run dev to start all services in development mode
2. Backend server starts on port 3000  
3. Database runs via Docker using PostgreSQL
4. Tests verify application functionality

