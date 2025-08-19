# MinIO Backup Setup Guide

This guide explains how to set up automated backups from your local MinIO instance to a remote MinIO server.

## Overview

The backup system provides multiple strategies for backing up your `workspaces` bucket:
- **Scheduled backups**: Run periodically (hourly by default)
- **Continuous sync**: Real-time mirroring with file watching
- **Manual backups**: On-demand backup execution
- **Disaster recovery**: Full restore capabilities

## Prerequisites

1. Access credentials for your remote MinIO server at `https://minio.etdofresh.com`
2. Docker and Docker Compose installed
3. Local MinIO instance running (already set up in this project)

## Quick Start

### 1. Configure Credentials

Create a `.env.backup` file with your remote MinIO credentials:

```bash
cp .env.backup.example .env.backup
```

Edit `.env.backup` and add your remote MinIO credentials:
```env
REMOTE_MINIO_USER=your-access-key
REMOTE_MINIO_PASSWORD=your-secret-key
```

### 2. Start Scheduled Backups

Run the backup service using Docker Compose:

```bash
# Start scheduled backup service (runs every hour by default)
docker-compose -f docker-compose.s3-direct.yml -f docker-compose.backup.yml --env-file .env.backup up -d

# Check backup logs
docker logs workspace-minio-backup -f
```

### 3. Manual Backup

Run a one-time backup manually:

```bash
# Make script executable
chmod +x scripts/backup-minio.sh

# Run backup (dry run first to test)
REMOTE_MINIO_USER=your-key REMOTE_MINIO_PASSWORD=your-secret \
  ./scripts/backup-minio.sh --dry-run

# Run actual backup
REMOTE_MINIO_USER=your-key REMOTE_MINIO_PASSWORD=your-secret \
  ./scripts/backup-minio.sh
```

## Backup Modes

### Mirror Mode (Default)
- One-way sync from local to remote
- Deletes files from remote that don't exist locally
- Best for maintaining exact copy

```bash
BACKUP_MODE=mirror ./scripts/backup-minio.sh
```

### Incremental Mode
- Only copies new and modified files
- Doesn't delete anything from remote
- Best for archival purposes

```bash
BACKUP_MODE=incremental ./scripts/backup-minio.sh
```

### Continuous Sync Mode
- Real-time file watching and syncing
- Minimal delay between local changes and backup

```bash
# Start continuous sync service
docker-compose -f docker-compose.backup.yml --profile backup-watch up -d minio-backup-watch
```

## Restore Operations

### Full Restore (Disaster Recovery)

In case of data loss, restore from remote backup:

```bash
# Check what would be restored (dry run)
REMOTE_MINIO_USER=your-key REMOTE_MINIO_PASSWORD=your-secret \
  ./scripts/restore-minio.sh --dry-run

# Perform full restore (will create local backup first)
REMOTE_MINIO_USER=your-key REMOTE_MINIO_PASSWORD=your-secret \
  ./scripts/restore-minio.sh --mode mirror
```

### Merge Restore (Selective)

Restore only missing or newer files:

```bash
REMOTE_MINIO_USER=your-key REMOTE_MINIO_PASSWORD=your-secret \
  ./scripts/restore-minio.sh --mode merge
```

### Point-in-Time Restore

If versioning is enabled on remote bucket:

```bash
REMOTE_MINIO_USER=your-key REMOTE_MINIO_PASSWORD=your-secret \
  ./scripts/restore-minio.sh --point-in-time "2024-01-15 10:30:00"
```

## Monitoring

### Check Backup Status

```bash
# View backup service logs
docker logs workspace-minio-backup --tail 50 -f

# Check bucket sizes
docker exec workspace-minio-backup mc du myminio/workspaces
docker exec workspace-minio-backup mc du remote-minio/workspaces

# List recent backups
docker exec workspace-minio-backup mc ls remote-minio/workspaces --recursive | head -20
```

### Verify Backup Integrity

```bash
# Compare local and remote object counts
./scripts/backup-minio.sh --dry-run
```

## Configuration Options

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `BACKUP_MODE` | Backup strategy (mirror/incremental) | mirror |
| `BACKUP_INTERVAL` | Time between backups (seconds) | 3600 |
| `INITIAL_DELAY` | Delay before first backup | 60 |
| `DRY_RUN` | Test mode without changes | false |

### Docker Compose Profiles

- Default: Scheduled backups every hour
- `backup-watch`: Continuous real-time sync

```bash
# Start with specific profile
docker-compose -f docker-compose.backup.yml --profile backup-watch up -d
```

## Troubleshooting

### Connection Issues

```bash
# Test remote MinIO connectivity
docker run --rm -it minio/mc:latest \
  mc alias set test https://minio.etdofresh.com YOUR_KEY YOUR_SECRET
```

### Permission Errors

Ensure your remote MinIO credentials have appropriate permissions:
- `s3:ListBucket`
- `s3:GetObject`
- `s3:PutObject`
- `s3:DeleteObject`

### Backup Failures

Check logs for specific errors:
```bash
docker logs workspace-minio-backup --tail 100 | grep ERROR
```

## Best Practices

1. **Test backups regularly**: Run restore tests in a staging environment
2. **Monitor backup logs**: Set up alerts for backup failures
3. **Secure credentials**: Never commit `.env.backup` to version control
4. **Version control**: Keep versioning enabled on both local and remote buckets
5. **Retention policy**: Configure lifecycle policies to manage old versions

## Advanced Configuration

### Custom Backup Schedule

Modify `BACKUP_INTERVAL` in `.env.backup`:
```env
BACKUP_INTERVAL=7200  # Every 2 hours
BACKUP_INTERVAL=86400 # Daily
BACKUP_INTERVAL=300   # Every 5 minutes
```

### Exclude Patterns

Edit `docker-compose.backup.yml` to add exclusions:
```yaml
command: |
  mc mirror --watch \
    --exclude "*.tmp" \
    --exclude "*.log" \
    --exclude "node_modules/*" \
    local-minio/workspaces \
    remote-minio/workspaces
```

### Multiple Remote Destinations

Create additional backup services in `docker-compose.backup.yml` for redundancy.

## Security Considerations

1. **Encryption in transit**: Always use HTTPS for remote MinIO endpoints
2. **Access keys**: Use dedicated backup credentials with minimal permissions
3. **Audit logging**: Enable audit logging on remote MinIO for compliance
4. **Network isolation**: Consider VPN or private networking for sensitive data

## Support

For issues or questions:
1. Check backup logs: `docker logs workspace-minio-backup`
2. Verify credentials: Ensure `.env.backup` has correct values
3. Test connectivity: Use mc client to test connections manually