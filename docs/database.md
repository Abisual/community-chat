# Database

## Overview

The application uses PostgreSQL as its primary database for persistent data storage.

## Design Principles

- PostgreSQL is not publicly exposed in production
- All database connections are secured with environment-specific credentials
- No Redis unless later proven necessary
- Schema designed to support core MVP features:
  - User accounts (username, hashed passwords)
  - Session management
  - Voice room metadata (predefined set of public rooms)
  - Basic chat messages
  - User settings

## Implementation Details

- Database connection strings and secrets are stored in environment variables
- Migration scripts are used for schema evolution
- All database operations use parameterized queries to prevent SQL injection
- Read-only connections are used where possible for performance

## Connection Security

- Database is configured with secure access controls
- Network-level security (firewall rules) restricts database access
- Production credentials are never included in source code