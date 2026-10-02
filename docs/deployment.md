# Deployment

## Overview

The application is deployed using Docker Compose with pinned versions for consistency.

## Infrastructure

- Production deployments use Docker Compose
- All Docker image versions are pinned to avoid unexpected updates
- PostgreSQL is not publicly exposed in production
- LiveKit API secrets never reach the client

## Environment Management

- `.env.example` file included instead of real secrets
- Environment variables used for configuration
- No sensitive information stored in source code
- Secrets managed through secure deployment pipeline

## Security Considerations

- HTTPS/WSS enforced in production
- PostgreSQL connections secured with proper firewall rules
- API endpoints require authentication tokens
- Token-based session management with short-lived access tokens

## Versioning

- Docker images use specific version tags
- Dependency versions are pinned for reproducible builds
- No automatic updates for production containers