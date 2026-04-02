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
- PostgreSQL 15+

### Setup

```bash
# Install dependencies
pnpm install

# Copy environment config
cp .env.example .env
# Edit .env with your database URL

# Generate Prisma client
pnpm db:generate

# Push schema to database (development)
pnpm db:push

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
| `pnpm db:push` | Push schema to database |

## Project Status

MVP foundation — repository bootstrap and core domain model established.
