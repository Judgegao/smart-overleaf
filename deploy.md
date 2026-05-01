# Overleaf CE Deployment Guide

This document explains how to run this customized Overleaf CE build outside the development environment. Do not use `develop/bin/up` or `develop/bin/dev` for a real deployment.

## 1. Basic Requirements

Recommended server sizes for internal university or small-team use:

| Scenario | Recommended server |
| --- | --- |
| Lab or research group | 4-8 vCPU / 16GB RAM / 200GB SSD |
| Department use | 8-16 vCPU / 32GB RAM / 500GB SSD |
| Campus-level concurrent use | 16+ vCPU / 64GB+ RAM, and consider service split or Server Pro |

Prepare:

- Ubuntu Server 22.04/24.04 LTS
- Docker Engine and Docker Compose plugin
- Internal DNS name, for example `overleaf.example.edu.cn`
- HTTPS certificate, from the university CA, internal CA, or Let's Encrypt DNS validation
- SMTP service for registration, invitations, and password reset emails
- LLM API service for the LLM Assistant feature
- Backup storage, preferably on a different disk or another server

Note: Overleaf CE is suitable for trusted users. Do not expose it directly to uncontrolled public users.

## 2. Install Docker

Install Docker Engine and the Docker Compose plugin before starting Overleaf.

On Ubuntu, a minimal setup is:

```bash
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER"
```

Log out and log back in, then verify:

```bash
docker version
docker compose version
```

## 3. Start With Overleaf Toolkit

This repository includes two helper scripts so you can still use Overleaf Toolkit with `bin/up -d`.

Run these commands from this customized Overleaf repository:

```bash
cd /path/to/overleaf

bin/build-production-image
bin/setup-toolkit ../overleaf-toolkit
cd ../overleaf-toolkit
bin/up -d
```

After the first start, create an administrator account:

```bash
bin/docker-compose exec sharelatex bash -lc 'cd /overleaf/services/web && node modules/server-ce-scripts/scripts/create-user.mjs --admin --email=admin@example.edu.cn'
```

The command prints an activation link. Open it in the browser and set the password. To reset the account password, run the command again and use the new activation link.

Open:

```text
http://localhost
```

## 4. Backup

Back up at least:

- MongoDB: users, project metadata, permissions, history indexes
- Overleaf data directory: project files, uploads, history blobs, compile-related data
- Toolkit config directory: `config/overleaf.rc`, `config/variables.env`, `config/version`

Create a backup script in the Toolkit directory:

```bash
cat > backup.sh <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

ts="$(date +%Y%m%d-%H%M%S)"
backup_dir="./backups/$ts"
mkdir -p "$backup_dir"

bin/docker-compose exec -T mongo mongodump \
  --db sharelatex \
  --archive \
  --gzip > "$backup_dir/mongo-sharelatex.archive.gz"

tar -czf "$backup_dir/config.tar.gz" config
tar -czf "$backup_dir/data.tar.gz" data

find ./backups -mindepth 1 -maxdepth 1 -type d -mtime +30 -exec rm -rf {} +
EOF

chmod +x backup.sh
```

Run it once manually:

```bash
./backup.sh
```

Add a cron job, for example daily at 02:00:

```bash
crontab -e
```

```cron
0 2 * * * cd /path/to/overleaf-toolkit && ./backup.sh >> backup.log 2>&1
```

Sync backups to NAS, object storage, or another server. Do not keep the only copy on the same disk as the Overleaf host.
