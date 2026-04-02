# Dealy

Shopping intelligence platform — find, compare, and monitor the best deals across sources.

## Architecture

Lean monorepo powered by pnpm workspaces and Turborepo.

| Package | Description |
|---------|-------------|
| `apps/web` | Next.js 14+ App Router — UI and API routes |
| `packages/db` | Prisma schema, migrations, and database client |
| `packages/domain` | Shared domain types and business logic services |

## Getting Started

### Prerequisites

- Node.js >= 20
- pnpm >= 9
- Docker (for local PostgreSQL)

### Setup

```bash
# Start PostgreSQL (port 5433)
docker compose up -d

# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env

# Generate Prisma client
pnpm db:generate

# Run migrations
cd packages/db && npx prisma migrate dev && cd ../..

# Seed sample data
cd packages/db && npx prisma db seed && cd ../..

# Start development server
pnpm dev
```

### Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start all apps in development mode |
| `pnpm build` | Build all packages and apps |
| `pnpm lint` | Lint all packages |
| `pnpm typecheck` | TypeScript type checking |
| `pnpm db:generate` | Generate Prisma client |
| `docker compose up -d` | Start local PostgreSQL |
| `docker compose down` | Stop local PostgreSQL |

## Project Status

MVP foundation with runtime-proven database, API routes, and UI pages.
