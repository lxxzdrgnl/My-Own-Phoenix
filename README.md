# My Own Phoenix

LLM observability and evaluation platform. Monitor traces, run automated evaluations, manage datasets, and collaborate on AI projects.

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript
- **Database**: PostgreSQL + Prisma 7
- **Auth**: Firebase Authentication
- **Observability**: Arize Phoenix
- **UI**: Tailwind CSS + Radix UI
- **Charts**: Highcharts
- **Deployment**: Docker Compose + GitHub Actions

## Getting Started

### Prerequisites
- Node.js 22+
- Docker & Docker Compose
- PostgreSQL 16

### Setup

```bash
# Clone
git clone https://github.com/lxxzdrgnl/My-Own-Phenix.git && cd my-own-phoenix

# Install
npm install

# Environment
cp .env.example .env
# Edit .env with your Firebase, PostgreSQL, and encryption settings

# Database
npx prisma migrate deploy
npx prisma generate

# Run
docker compose up -d   # PostgreSQL + Phoenix + Eval Worker
npm run dev             # Dashboard on http://localhost:3000
```

## Project Structure

```
app/
  [slug]/          # Project pages (chat, playground, evaluations, etc.)
  api/             # API routes
  docs/            # Documentation page
  projects/        # Project listing
  settings/        # Global settings
components/
  ui/              # Base primitives (Button, Input, Modal, Sidebar, etc.)
  modals/          # Modal dialogs
  dashboard/       # Dashboard widgets
lib/
  hooks/           # Custom React hooks
  api-client.ts    # Client-side fetch with auth
  api-error.ts     # Error handling + authedHandler wrapper
  api-helpers.ts   # Shared API middleware (project membership, etc.)
  prisma.ts        # Prisma client
  llm-providers.ts # Multi-provider LLM routing
  crypto.ts        # AES-256-GCM encryption
eval-worker/       # Python evaluation worker
prisma/            # Schema + migrations
```

## API Documentation

Visit `/docs` in the running app for the full API reference covering all endpoints.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ENCRYPTION_SECRET` | Yes | AES-256-GCM key for API key encryption |
| `INTERNAL_SERVICE_TOKEN` | Yes | Shared secret for eval worker auth |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Yes | Firebase config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Yes | Firebase config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Yes | Firebase config |
| `PHOENIX_URL` | No | Phoenix server URL (default: http://localhost:6006) |
