# My Own Phoenix

LLM observability and evaluation platform. Monitor traces, run automated evaluations, manage datasets, and collaborate on AI projects.

**Live:** https://phoenix.rheon.kr
**Docs:** https://phoenix.rheon.kr/docs

## Documentation

The `/docs` page provides interactive guides with live UI previews for every feature.

### Getting Started

| Section | Description |
|---------|-------------|
| Quick Start (Tracing) | Instrument your agent and collect traces in under 2 minutes. Code examples for OpenAI, LangChain, and custom agents. |
| Connector Setup | Connect your local agent via WebSocket for Chat, Playground, and Dataset testing. LangGraph and REST SSE examples. |
| API Keys | Three key types: Trace Key (`pt_*`), Connector Key (`pc_*`), LLM Provider Key. |

### Features

| Section | Description |
|---------|-------------|
| Tracing | Interactive trace viewer with span tree, Input/Output tabs, annotation badges, and span graph. |
| Evaluations | 7 built-in templates (HAL, CIT, TOOL, QA, RAG, GRD, BAN). LLM-as-Judge and code rule types with form builder. |
| Dashboard | Drag-and-drop widgets with Summary/Trend/Detail views, color customization, and NIST AI RMF metrics. |
| Datasets | Test datasets with agent runs and automated evaluation. Interactive Generate and Evaluate simulation. |
| Chat | Real-time chat with connected agents. All messages are automatically traced. |
| Playground | Side-by-side prompt comparison with up to 6 columns against the same traces. |

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

Visit [phoenix.rheon.kr/docs](https://phoenix.rheon.kr/docs) for interactive documentation with live UI previews, or [/api/docs](https://phoenix.rheon.kr/api/docs) for the Swagger API reference.

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
