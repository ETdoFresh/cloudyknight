# Cloudflare R2 Backup Setup Guide

This guide walks you through setting up Cloudflare R2 as a backup destination for your MinIO workspaces.

## What is Cloudflare R2?

Cloudflare R2 is an S3-compatible object storage service with:
- **No egress fees** - Free data transfer out
- **S3 API compatibility** - Works with existing S3 tools
- **Global distribution** - Cloudflare's network presence
- **Competitive pricing** - $0.015/GB/month for storage

## Step 1: Access Your R2 Dashboard

1. Go to [https://dash.cloudflare.com](https://dash.cloudflare.com)
2. Log in with your Cloudflare account
3. Look for **R2** in the left sidebar under "Storage"
4. Click on **R2** to access your R2 dashboard

## Step 2: Create an R2 Bucket (Optional)

If you want to create the bucket manually:

1. In the R2 dashboard, click **Create bucket**
2. Name it `workspaces` (or your preferred name)
3. Choose your region (if applicable)
4. Click **Create bucket**

*Note: The backup script can create the bucket automatically if it doesn't exist*

## Step 3: Generate API Credentials

### Navigate to API Tokens
1. In the R2 dashboard, look for **Manage R2 API Tokens** (usually on the right side)
2. Click **Create API Token**

### Configure Your Token
Fill in the following settings:

| Setting | Recommended Value | Notes |
|---------|------------------|--------|
| **Token name** | `minio-backup` | Any descriptive name |
| **Permissions** | `Object Read & Write` | Required for backup operations |
| **Specify bucket** | `Apply to all buckets` or select `workspaces` | Limit scope if desired |
| **TTL** | `Forever` | Or set expiration date |
| **Client IP filtering** | Leave blank | Unless you have static IPs |

### Save Your Credentials
After clicking **Create API Token**, you'll see:

```
Access Key ID: [Your Access Key - looks like: a1b2c3d4e5f6g7h8i9j0]
Secret Access Key: [Your Secret - longer string, COPY THIS NOW!]
```

⚠️ **CRITICAL**: Copy the Secret Access Key immediately! It's only shown once and cannot be retrieved later.

### Your Endpoint URL
Your R2 endpoint from the URL you provided:
```
https://a6a59f0988d2ad706f9231e25636c95c.r2.cloudflarestorage.com
```

The format is: `https://[ACCOUNT_ID].r2.cloudflarestorage.com`
- Your Account ID: `a6a59f0988d2ad706f9231e25636c95c`

## Step 4: Configure Multi-Destination Backup

### Create Environment File
```bash
cp .env.multi-backup.example .env.multi-backup
```

### Edit .env.multi-backup
Add your Cloudflare R2 credentials:
```env
# Cloudflare R2 Configuration
REMOTE2_ENDPOINT=https://a6a59f0988d2ad706f9231e25636c95c.r2.cloudflarestorage.com
REMOTE2_ACCESS_KEY=your-access-key-id-here
REMOTE2_SECRET_KEY=your-secret-access-key-here
REMOTE2_NAME="Cloudflare R2"
REMOTE2_ENABLED=true
```

## Step 5: Test R2 Connection

### Quick Test
```bash
export R2_ACCESS_KEY='your-access-key-id'
export R2_SECRET_KEY='your-secret-access-key'
./scripts/test-cloudflare-r2.sh
```

### Expected Output
```
✓ Successfully connected to Cloudflare R2
✓ Bucket 'workspaces' exists (or was created)
✓ Write test successful
```

## Step 6: Run Multi-Destination Backup

### Manual Test (Dry Run)
```bash
source .env.multi-backup
./scripts/backup-multi-destination.sh --dry-run
```

### Actual Backup
```bash
source .env.multi-backup
./scripts/backup-multi-destination.sh
```

### Start Automated Service
```bash
docker-compose -f docker-compose.multi-backup.yml --env-file .env.multi-backup up -d
```

## Step 7: Monitor Backups

### Check Service Status
```bash
docker logs workspace-minio-multi-backup --tail 50
```

### View Live Logs
```bash
docker logs -f workspace-minio-multi-backup
```

## Backup Strategies

### Parallel Backups (Default)
Both destinations backup simultaneously:
- Faster completion time
- Higher bandwidth usage
- Both complete independently

### Sequential Backups
One destination at a time:
```bash
PARALLEL_BACKUP=false ./scripts/backup-multi-destination.sh
```

## Cost Estimation

### Cloudflare R2 Pricing (as of 2024)
- **Storage**: $0.015/GB/month
- **Class A operations** (writes): $4.50/million requests
- **Class B operations** (reads): $0.36/million requests
- **Egress**: FREE (major advantage!)

### Example Monthly Costs
For 100GB of backups with daily updates:
- Storage: 100GB × $0.015 = $1.50/month
- Write operations: ~30,000 × $0.0000045 = $0.14/month
- **Total: ~$1.64/month**

Compare to AWS S3: Would be ~$2.30/month + egress fees

## Troubleshooting

### "Invalid credentials" Error
- Verify Access Key ID and Secret Access Key are correct
- Check for extra spaces or quotes in credentials
- Ensure token has Object Read & Write permissions

### "Bucket not found" Error
- The script will create the bucket automatically
- Verify token has permission to create buckets
- Try creating bucket manually in R2 dashboard

### "Connection timeout" Error
- Check your internet connection
- Verify the endpoint URL is correct
- Ensure no firewall is blocking HTTPS traffic

### "Permission denied" Error
- Token may have insufficient permissions
- Regenerate token with Object Read & Write
- Check if bucket-specific permissions are set

## Advanced Configuration

### Multiple R2 Buckets
Use different buckets for different backup strategies:
```bash
# Production backups
BUCKET_NAME=workspaces-prod ./scripts/backup-multi-destination.sh

# Development backups
BUCKET_NAME=workspaces-dev ./scripts/backup-multi-destination.sh
```

### Lifecycle Rules
Set up automatic deletion of old backups in R2 dashboard:
1. Select your bucket
2. Go to Settings → Lifecycle rules
3. Add rule to delete objects older than X days

### Monitoring with Cloudflare Analytics
1. In R2 dashboard, click on your bucket
2. View Analytics tab for:
   - Storage usage over time
   - Request patterns
   - Bandwidth usage (always free!)

## Security Best Practices

1. **Use environment files**: Never hardcode credentials
2. **Limit token scope**: Use bucket-specific permissions when possible
3. **Rotate credentials**: Regenerate tokens periodically
4. **Monitor access logs**: Check R2 analytics for unusual activity
5. **Enable versioning**: Keep multiple versions of critical files

## Benefits of Multi-Destination Backup

With both MinIO and Cloudflare R2:
- **Geographic redundancy**: Data in multiple locations
- **Provider redundancy**: Not dependent on single service
- **Cost optimization**: R2's free egress for restores
- **Compliance**: May satisfy data residency requirements

## Support Resources

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [R2 API Compatibility](https://developers.cloudflare.com/r2/api/s3/api/)
- [Cloudflare Community](https://community.cloudflare.com/c/developers/storage/81)
- [Status Page](https://www.cloudflarestatus.com/)

## Next Steps

1. ✅ Get R2 credentials from Cloudflare dashboard
2. ✅ Configure .env.multi-backup with credentials
3. ✅ Test connection with test-cloudflare-r2.sh
4. ✅ Run initial backup to both destinations
5. ✅ Set up automated hourly backups
6. 📊 Monitor usage in both MinIO and R2 dashboards