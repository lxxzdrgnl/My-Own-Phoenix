# Plan 7: Deployment — GitHub Actions + Docker Compose

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Set up CI/CD pipeline to deploy the SaaS to a mini PC via GitHub Actions, using the same pattern as the SajuGuri project.

**Architecture:** On push to main → GitHub Actions SSHs to mini PC → pulls latest code → rebuilds Docker containers → runs migrations → health check. PostgreSQL runs directly on the mini PC (not in Docker). Phoenix + Next.js app run in Docker Compose.

**Tech Stack:** GitHub Actions, Docker Compose, SSH, PostgreSQL 16

**Depends on:** Plan 1 (PostgreSQL), Plan 3 (security — Phoenix internal network)

**Reference:** `/home/rheon/Desktop/projects/SajuGuri/.github/workflows/deploy-backend.yml`

---

### Task 1: Create GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/deploy.yml`

```yaml
name: Deploy to Server

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.PC_SSH_HOST }}
          username: ${{ secrets.PC_SSH_USER }}
          key: ${{ secrets.PC_SSH_KEY }}
          script: |
            set -e

            # Navigate to project
            cd ~/servers/my-own-phoenix

            # Write env file
            echo '${{ secrets.APP_ENV }}' > .env

            # Pull latest
            cd repo
            git pull origin main

            # Rebuild and restart app container only
            docker compose build --no-cache dashboard
            docker compose up -d --no-deps dashboard

            # Run migrations
            docker compose exec -T dashboard npx prisma migrate deploy

            # Restart eval-worker too
            docker compose up -d --no-deps eval-worker

            # Health check
            sleep 8
            curl -sf http://localhost:3000/api/health || exit 1
            echo "✓ Deploy successful"
```

---

### Task 2: Create Health Check Endpoint

**Files:**
- Create: `app/api/health/route.ts`

```typescript
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    // Verify DB connection
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", db: "connected" });
  } catch (e) {
    return NextResponse.json({ status: "error", db: "disconnected" }, { status: 500 });
  }
}
```

Note: This endpoint does NOT require auth (health checks need to work without tokens).

---

### Task 3: Update docker-compose.yml for Production

**Files:**
- Modify: `docker-compose.yml`

**Key changes:**
```yaml
services:
  phoenix:
    image: arizephoenix/phoenix:latest
    # No ports exposed — internal only
    networks:
      - internal
    volumes:
      - ~/.phoenix:/data
    environment:
      - PHOENIX_WORKING_DIR=/data
    healthcheck:
      test: ["CMD", "python3", "-c", "import urllib.request; urllib.request.urlopen('http://localhost:6006/healthz')"]
      interval: 5s
      timeout: 5s
      retries: 10
      start_period: 15s

  dashboard:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        - NEXT_PUBLIC_FIREBASE_API_KEY=${NEXT_PUBLIC_FIREBASE_API_KEY}
        - NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN}
        - NEXT_PUBLIC_FIREBASE_PROJECT_ID=${NEXT_PUBLIC_FIREBASE_PROJECT_ID}
        - NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID=${NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID}
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - PHOENIX_URL=http://phoenix:6006
      - PHOENIX_COLLECTOR_ENDPOINT=http://phoenix:6006
    networks:
      - internal
    depends_on:
      phoenix:
        condition: service_healthy
    restart: unless-stopped

  eval-worker:
    build:
      context: ./eval-worker
      dockerfile: Dockerfile
    env_file:
      - .env
    environment:
      - PHOENIX_URL=http://phoenix:6006
      - DASHBOARD_URL=http://dashboard:3000
      - EVAL_POLL_INTERVAL=15
    networks:
      - internal
    depends_on:
      phoenix:
        condition: service_healthy
    restart: unless-stopped

networks:
  internal:
    driver: bridge
```

**PostgreSQL is NOT in docker-compose** — it runs directly on the mini PC.
`DATABASE_URL` in `.env` points to `postgresql://user:pass@host.docker.internal:5432/phoenix_prod`
(or the mini PC's actual IP if `host.docker.internal` is not available on Linux — use `172.17.0.1` or `network_mode: host` for dashboard)

**Alternative for Linux (no host.docker.internal):**
Set dashboard to `network_mode: host` and use `localhost:5432` for DATABASE_URL. Phoenix remains on internal network, accessed via Docker DNS name by using an extra network bridge. This matches the current docker-compose pattern.

---

### Task 4: Configure GitHub Secrets

**Secrets to set in GitHub repo settings:**

| Secret | Value |
|--------|-------|
| `PC_SSH_KEY` | SSH private key for mini PC access |
| `PC_SSH_HOST` | Mini PC IP or hostname |
| `PC_SSH_USER` | SSH username |
| `APP_ENV` | Full .env file content (multi-line) |

**APP_ENV content:**
```
DATABASE_URL=postgresql://phoenix_user:password@localhost:5432/phoenix_prod
ENCRYPTION_SECRET=<generated>
INTERNAL_SERVICE_TOKEN=<generated>
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_LANGGRAPH_ASSISTANT_ID=agent
FIREBASE_SERVICE_ACCOUNT_KEY=...
```

---

### Task 5: Server Initial Setup Script

**Files:**
- Create: `scripts/server-setup.sh`

**One-time setup on mini PC:**
```bash
#!/bin/bash
set -e

# Create project directory
mkdir -p ~/servers/my-own-phoenix
cd ~/servers/my-own-phoenix

# Clone repo
git clone <repo-url> repo

# Create PostgreSQL database
sudo -u postgres createuser phoenix_user
sudo -u postgres createdb phoenix_prod -O phoenix_user
sudo -u postgres psql -c "ALTER USER phoenix_user WITH PASSWORD 'your_password';"

# Create Phoenix data directory
mkdir -p ~/.phoenix

# Initial deploy
cd repo
cp .env.example .env
# Edit .env with production values
docker compose build
docker compose up -d

echo "✓ Server setup complete"
```

---

### Task 6: Update Dockerfile CMD

**Files:**
- Modify: `Dockerfile`

**Change CMD to support both migration and WebSocket server:**
```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
```

Note: `server.js` here refers to either:
- Next.js standalone server (current), or
- Custom server from Plan 6 Task 1 (if WebSocket relay is implemented)

If using custom server, the CMD becomes:
```dockerfile
CMD ["sh", "-c", "npx prisma migrate deploy && node server.ts"]
```
And the build stage compiles `server.ts` → `server.js`.
