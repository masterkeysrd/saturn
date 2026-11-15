# Saturn

**Saturn personal life operating system**

Saturn is a multi-tenant personal Life Operating System (Life OS) that helps you manage finances, calendars, email, and automated AI workflows — all organized around isolated **Spaces**. Whether you're managing personal finances, household budgets, or side projects, Saturn keeps everything structured and in sync across Web and Mobile.

<div align="center">

[![CI](https://github.com/masterkeysrd/saturn/actions/workflows/ci.yaml/badge.svg?branch=main)](https://github.com/masterkeysrd/saturn/actions/workflows/ci.yaml)
[![CodeQL](https://github.com/masterkeysrd/saturn/actions/workflows/codeql.yml/badge.svg?branch=main)](https://github.com/masterkeysrd/saturn/actions/workflows/codeql.yml)
[![Go Reference](https://pkg.go.dev/badge/github.com/masterkeysrd/saturn.svg)](https://pkg.go.dev/github.com/masterkeysrd/saturn)
[![Go Report Card](https://goreportcard.com/badge/github.com/masterkeysrd/saturn)](https://goreportcard.com/report/github.com/masterkeysrd/saturn)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.27%2B-blue.svg)](https://go.dev/)
[![gRPC](https://img.shields.io/badge/gRPC-enabled-blue.svg)](https://grpc.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16%2B-teal.svg)](https://www.postgresql.org/)

</div>

---

## 🚀 Features

| Feature | Description |
| --- | --- |
| **Identity & Security** | Ed25519 JWT access/refresh rotation, TOTP MFA & recovery codes, hardware device biometrics, scoped API keys (`sat_*`), and audit logs |
| **Spaces** | Multi-tenant workspaces with role-based access (`owner`, `admin`, `member`, `viewer`) and isolated settings |
| **Personal Finances** | Accounts, multi-currency exchange rates, budgets & fiscal periods, expenses/incomes/transfers, PDF statement reconciliation, recurring & scheduled transactions, borrowings, and insights |
| **Calendar** | Multi-calendar management, recurring events (RRULE), and Google Calendar OAuth sync |
| **Mail** | Unified inbox, threads, rich-text composer, attachments, and Gmail OAuth sync |
| **Workflows & AI Agents** | Event-driven automation pipelines triggered by domain events or cron schedules with LLM agent steps |
| **Platform & Admin** | Postgres-backed EventBus & Scheduler, local/S3 database backups, and system administration |

## 🏗 Architecture

Saturn follows a clean hexagonal + CQRS architecture:

```
┌────────────────────────────────────────────────────────┐
│      Clients (Web React / Mobile Expo / Go CLI)        │
└───────────────────────────┬────────────────────────────┘
                            │  HTTP REST (/api/v1/*) & gRPC
┌───────────────────────────▼────────────────────────────┐
│             Saturn Server (Go 1.27)                    │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Transport Interceptors (Auth, RateLimit, Space)  │  │
│  └────────────────────────┬─────────────────────────┘  │
│             ┌─────────────┴─────────────┐              │
│  ┌──────────▼──────────┐     ┌──────────▼───────────┐  │
│  │ Coordinators (App)  │     │ Aggregators (CQRS)   │  │
│  └──────────┬──────────┘     └──────────┬───────────┘  │
│             └─────────────┬─────────────┘              │
│  ┌────────────────────────▼─────────────────────────┐  │
│  │        Pure Domain Services & Storage Ports      │  │
│  └────────────────────────┬─────────────────────────┘  │
└───────────────────────────┼────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────┐
│               PostgreSQL (Multi-tenant)                │
└────────────────────────────────────────────────────────┘
```

- **Backend**: Go 1.27 with gRPC over Unix socket and gRPC-Gateway HTTP REST API (`/api/v1/*`)
- **Database**: PostgreSQL 16+ with Goose migrations and space-scoped isolation
- **Web (`apps/web`)**: React 19, Vite, TypeScript, Tailwind CSS, TanStack Query
- **Mobile (`apps/mobile`)**: React Native / Expo Router (iOS & Android)
- **Shared Packages (`packages/*`)**: `@saturn/core`, `@saturn/hooks`, `@saturn/schemas`, `@saturn/api`

## CLI

Saturn ships with a CLI built on [Cobra](https://github.com/spf13/cobra) and [Viper](https://github.com/spf13/viper).

### `saturn serve` — Start the Service

Starts the gRPC server, background EventBus/Scheduler workers, and gRPC-Gateway HTTP server (with embedded Web UI).

```bash
saturn serve [flags]
```

#### Configuration

Configuration is loaded in priority order: **flags > env vars (`SATURN_*`) > `saturn.yaml` > defaults**.

| Variable | Description | Default |
| --- | --- | --- |
| `SATURN_DB_HOST` | PostgreSQL host | `localhost` |
| `SATURN_DB_PORT` | PostgreSQL port | `5432` |
| `SATURN_DB_USER` | Database user | `saturn` |
| `SATURN_DB_PASSWORD` | Database password | `saturn` |
| `SATURN_DB_NAME` | Database name | `saturn` |
| `SATURN_DB_SSL_MODE` | PostgreSQL SSL mode (`disable`, `require`, `verify-ca`, `verify-full`) | `require` |
| `SATURN_GRPC_SOCKET` | gRPC Unix socket path | `/tmp/saturn-identity.sock` |
| `SATURN_GATEWAY_ADDR` | HTTP gateway listen address | `:8080` |
| `SATURN_GATEWAY_ROUTE_PREFIX` | REST API route prefix | `/api/v1` |
| `SATURN_GATEWAY_COOKIE_SECURE` | Set `Secure` attribute on auth cookies | `true` |
| `SATURN_GATEWAY_TRUSTED_PROXIES` | Comma-separated trusted reverse-proxy CIDRs/IPs | `""` |
| `SATURN_AUTH_RATE_LIMIT_ENABLED` | Enable declarative YAML rate-limiting interceptor | `true` |
| `SATURN_SECURITY_ENCRYPTION_KEY` | 32-byte key for encrypting MFA secrets and OAuth tokens | `""` |
| `SATURN_SHUTDOWN_TIMEOUT` | Graceful shutdown timeout | `10s` |
| `SATURN_LOG_LEVEL` | Log level (`debug`, `info`, `warn`, `error`) | `info` |
| `SATURN_SWAGGER_ENABLED` | Serve interactive Swagger UI at `/swagger/` | `false` |

**Config File**: `saturn.yaml` (current directory or `$HOME/.config/saturn/saturn.yaml`)

```yaml
db:
  host: localhost
  port: 5432
  ssl_mode: disable
grpc:
  socket: /tmp/saturn-identity.sock
gateway:
  addr: ":8080"
  cookie_secure: false
shutdown:
  timeout: 10s
log:
  level: info
```

### Prerequisites

- [Go](https://go.dev/) 1.27+
- [Node.js](https://nodejs.org/) 26+
- [PostgreSQL](https://www.postgresql.org/) 16+
- [Docker](https://www.docker.com/) (optional, for PostgreSQL / full compose stack)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/masterkeysrd/saturn.git
cd saturn

# Install JS workspace dependencies
npm ci

# Start PostgreSQL (via Docker)
docker run -d \
  --name saturn-db \
  -e POSTGRES_USER=saturn \
  -e POSTGRES_PASSWORD=saturn \
  -e POSTGRES_DB=saturn \
  -p 5432:5432 \
  postgres:16-alpine

# Run migrations (local dev without TLS)
SATURN_DB_SSL_MODE=disable go run ./cmd/saturn migrate up

# Build web assets and start the API server
make web-build
SATURN_DB_SSL_MODE=disable SATURN_GATEWAY_COOKIE_SECURE=false go run ./cmd/saturn serve

# (Optional) Create an admin user
SATURN_DB_SSL_MODE=disable go run ./cmd/saturn admin create-user \
  --email admin@example.com --username admin --name Admin --role admin
```

For frontend or mobile hot-reload development:

```bash
make web-dev     # Vite dev server (apps/web)
make mobile-dev  # Expo Metro bundler (apps/mobile)
```

### Docker

A multi-stage Dockerfile is provided at `build/saturn/Dockerfile`. It builds the Web UI with Node 26, compiles the static Go 1.27 binary with embedded UI assets, and runs as a non-root user.

```bash
# Build the image
docker build -t saturn -f build/saturn/Dockerfile .

# Build with a version tag
docker build -t saturn:v0.1.0 \
   --build-arg VERSION=v0.1.0 \
   -f build/saturn/Dockerfile .

# Run (or use `make compose-up` for full stack with PostgreSQL)
docker run --name saturn -p 8080:8080 saturn
```

The image exposes port **8080** (HTTP gateway), including `/healthz` (liveness) and `/readyz` (database readiness).

## 🧱 Project Structure

```
saturn/
├── api/                  # Protocol Buffer definitions, declarative service YAMLs, and OpenAPI specs
├── apis/                 # Generated Go packages (Protobuf, gRPC, Gateway, SDK)
├── apps/                 # Application clients
│   ├── web/              # Web frontend (React, Vite, Tailwind CSS)
│   └── mobile/           # Mobile app (Expo, React Native)
├── packages/             # Shared TypeScript workspace packages
│   ├── api/              # Generated TypeScript clients, React Query hooks & SaturnApiError
│   ├── core/             # Zero-dependency domain math, timezone, JWT & formatting helpers
│   ├── hooks/            # Shared React context providers & custom hooks
│   └── schemas/          # Shared Zod validation schemas
├── build/                # Container and packaging definitions (Dockerfiles)
├── cmd/saturn/           # Unified CLI (serve, migrate, admin)
├── deployments/          # Deployment configurations (Docker Compose)
├── docs/conventions/     # Engineering conventions across backend, API, testing, web, mobile
├── internal/             # Internal Go backend
│   ├── aggregator/       # Read-only CQRS query projections
│   ├── application/      # Use-case coordinators & transaction boundaries
│   ├── domain/           # Pure domain models, services & storage ports (+ storage/ adapters)
│   ├── foundation/       # Principal & Space context propagation (auth)
│   ├── platform/         # EventBus, Scheduler, Workflow, Backup, Errors, Settings, etc.
│   └── transport/        # gRPC handlers/interceptors, HTTP gateway, webhooks & scheduler runners
├── migrations/           # PostgreSQL Goose migrations
├── tests/                # Integration and end-to-end test suites (`//go:build integration`)
└── tools/                # Custom codegen & analysis tools (mockgen, txgen, loggen, covercheck, protoc plugins)
```

## 📖 API Overview

Saturn exposes both **gRPC** and **REST** endpoints under `/api/v1/*`. Space-scoped endpoints require the `Space-Id` header (or auto-resolve for single-space scoped API keys).

### Example: Create a Space

```bash
curl -X POST http://localhost:8080/api/v1/spaces \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <access-token>" \
  -d '{
    "name": "Personal",
    "description": "Personal workspace"
  }'
```

Interactive Swagger documentation is available by starting the server with `--swagger.enabled` (at `http://localhost:8080/swagger/`) or by reviewing [`api/api.swagger.json`](./api/api.swagger.json).

## 🤝 Contributing

Contributions are welcome! Please review [`AGENTS.md`](./AGENTS.md) and [`docs/conventions/`](./docs/conventions/) before making changes:

1. **Fork** the repository and create a feature branch (`git checkout -b feat/your-feature`)
2. Run formatting, linters, typechecks, and tests (`make lint && make test-unit && make web-test`)
3. Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
4. Open a **Pull Request**

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

---

**Built with ❤️ by [masterkeysrd](https://github.com/masterkeysrd)**
