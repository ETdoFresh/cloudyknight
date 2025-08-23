# PostgreSQL Migration Guide

## Overview
This guide explains how to migrate from JSON file storage to PostgreSQL for the Workspaces API.

## Database Setup

### Local Development (EHUB2023)
- **Host**: EHUB2023
- **Port**: 5432
- **Database**: postgres
- **User**: postgres
- **Password**: cunoj2awh6a6trsi

### Production (Dokploy)
- **Container**: workspaces-postgresql-j6qubz
- **Internal URL**: postgresql://postgres:cunoj2awh6a6trsi@workspaces-postgresql-j6qubz:5432/postgres
- **External Port**: 5432

## Migration Steps

### 1. Install Dependencies
```bash
npm install
```

### 2. Setup Environment Variables
For local development, create a `.env` file:
```bash
cp .env.example .env
# Edit .env with your local database settings
```

### 3. Run Database Migration
This will create the database schema and import existing workspaces from `workspaces.json`:
```bash
npm run migrate
```

### 4. Switch to PostgreSQL Server
The package.json has been updated to use the PostgreSQL version by default:
```bash
# Start the PostgreSQL-backed API
npm start

# Or for development with auto-reload
npm run dev
```

If you need to use the old JSON-based server:
```bash
npm run start:json
# or
npm run dev:json
```

## Database Schema

### Tables Created:
1. **workspaces** - Main table storing workspace data
   - id (PRIMARY KEY)
   - slug (UNIQUE)
   - name
   - icon
   - description
   - status
   - type
   - created
   - modified

2. **workspace_metadata** - Stores version and other metadata
   - id
   - key
   - value
   - updated_at

## API Endpoints
All endpoints remain the same:
- `GET /api/v1/workspaces` - List all workspaces
- `GET /api/v1/workspaces/:slug` - Get single workspace
- `POST /api/v1/workspaces` - Create new workspace
- `PUT /api/v1/workspaces/:slug` - Update workspace
- `DELETE /api/v1/workspaces/:slug` - Delete workspace
- `POST /api/v1/workspaces/:slug/docker/:action` - Docker operations
- `POST /api/v1/workspaces/:slug/execute` - Execute commands
- `GET /api/v1/health` - Health check (now includes DB status)

## Deployment to Dokploy

1. Set the environment variable in your Dokploy deployment:
   ```
   NODE_ENV=production
   ```

2. The application will automatically use the internal PostgreSQL container connection.

3. Run the migration on first deployment:
   ```bash
   npm run migrate
   ```

## Rollback to JSON
If you need to rollback to the JSON-based storage:
1. Change the start script in package.json back to `server.js`
2. Or use `npm run start:json`

## Troubleshooting

### Cannot connect to database
- For local: Ensure EHUB2023 is accessible and PostgreSQL is running on port 5432
- For production: Ensure the PostgreSQL container is running in Dokploy

### Migration fails
- Check that the database user has CREATE TABLE permissions
- Verify the workspaces.json file exists at `/workspaces/admin/workspaces.json`

### API returns empty workspaces
- Run `npm run migrate` to import existing data
- Check database connection with `GET /api/v1/health`