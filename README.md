# Saturn

**Your personal productivity suite — organized by space.**

Saturn is a multi-tenant personal productivity platform that helps you manage finances, habits, calendar events, focus sessions (Pomodoros), tasks, and notes — all organized around the concept of **Spaces**. Whether you're managing work, personal life, or side projects, Saturn keeps everything in its place.

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)
[![Go Version](https://img.shields.io/badge/Go-1.26%2B-blue.svg)](https://go.dev/)
[![gRPC](https://img.shields.io/badge/gRPC-enabled-blue.svg)](https://grpc.io/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15%2B-teal.svg)](https://www.postgresql.org/)

</div>

---

## 🚀 Features

| Feature | Description |
| --- | --- |
| **Spaces** | Multi-tenant architecture — organize everything into isolated workspaces (e.g., Work, Personal, Side Projects) |
| **Personal Finances** | Track income, expenses, budgets, and financial goals |
| **Habits** | Build and track daily/weekly habits with streaks and analytics |
| **Calendar** | Manage events, appointments, and schedules |
| **Pomodoro** | Focus timer with customizable intervals and session tracking |
| **Tasks** | Create, organize, and prioritize your to-dos |
| **Notes** | Quick note-taking with rich text support |

## 🏗 Architecture

Saturn follows a clean, modular architecture:

```
┌─────────────────────────────────────────────┐
│              Clients (Web / CLI / Mobile)     │
└────────────────────┬────────────────────────┘
                     │  gRPC + REST (gRPC Gateway)
┌────────────────────▼────────────────────────┐
│            Saturn API Server (Go)            │
│  ┌──────────┬──────────┬──────────┐         │
│  │ Finance  │ Habits   │ Calendar │ ...      │
│  └──────────┴──────────┴──────────┘         │
│              │        │        │              │
│  ┌───────────▼────────▼────────▼──────────┐  │
│  │         Space-aware middleware          │  │
│  └───────────────────────────────────────┘  │
└────────────────────┬────────────────────────┘
                     │
┌────────────────────▼────────────────────────┐
│           PostgreSQL (Multi-tenant)          │
└─────────────────────────────────────────────┘
```

- **Backend**: Go with gRPC for internal services and gRPC Gateway for RESTful HTTP APIs
- **Database**: PostgreSQL with row-level isolation per Space
- **Clients**: Web (React/Vue TBD), CLI (Go), Mobile (native / Flutter TBD)

## CLI

Saturn ships with a CLI built on [Cobra](https://github.com/spf13/cobra) and [Viper](https://github.com/spf13/viper).

### `saturn` — Root Command

The entry point for managing and running the Saturn service.

### `saturn serve` — Start the Service

Starts the gRPC server and gRPC-Gateway HTTP REST API.

```bash
saturn serve [flags]
```

#### Flags

| Flag | Description | Default |
| --- | --- | --- |
| `--grpc-socket` | gRPC Unix socket path | `/tmp/saturn-identity.sock` |
| `--gateway-addr` | HTTP gateway listen address | `:8080` |
| `--shutdown-timeout` | Graceful shutdown timeout | `10s` |
| `--log-level` | Log level (`debug`, `info`, `warn`, `error`) | `info` |

#### Configuration

Configuration is loaded in this priority order: **flags > env vars > config file > defaults**.

**Environment Variables** (prefix: `SATURN_`):

| Variable | Description | Default |
| --- | --- | --- |
| `SATURN_GRPC_SOCKET` | gRPC Unix socket path | `/tmp/saturn-identity.sock` |
| `SATURN_GATEWAY_ADDR` | HTTP gateway listen address | `:8080` |
| `SATURN_SHUTDOWN_TIMEOUT` | Graceful shutdown timeout | `10s` |
| `SATURN_LOG_LEVEL` | Log level | `info` |

**Config File**: `saturn.yaml` (current directory or `$HOME/.config/saturn/saturn.yaml`)

```yaml
grpc:
  socket: /tmp/saturn-identity.sock
gateway:
  addr: ":8080"
shutdown:
  timeout: 10s
log:
  level: info
```

### Prerequisites

- [Go](https://go.dev/) 1.26+
- [PostgreSQL](https://www.postgresql.org/) 15+
- [Docker](https://www.docker.com/) (optional, for PostgreSQL)

### Quick Start

```bash
# Clone the repository
git clone https://github.com/<you>/saturn.git
cd saturn

# Start PostgreSQL (via Docker)
docker run -d \
  --name saturn-db \
  -e POSTGRES_USER=saturn \
  -e POSTGRES_PASSWORD=saturn \
  -e POSTGRES_DB=saturn \
  -p 5432:5432 \
  postgres:15

# Run migrations
go run cmd/migrate/main.go up

# Start the API server
go run cmd/server/main.go

# (Optional) Start the CLI
go run cmd/saturn-cli/main.go
```

### Environment Variables

| Variable | Description | Default |
| --- | --- | --- |
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USER` | Database user | `saturn` |
| `DB_PASSWORD` | Database password | `saturn` |
| `DB_NAME` | Database name | `saturn` |
| `SERVER_PORT` | API server port | `8080` |
| `GRPC_PORT` | gRPC server port | `9090` |

## 🧱 Project Structure

```
saturn/
├── cmd/                  # Entry points (server, CLI, migrations)
├── internal/
│   ├── api/              # gRPC service implementations
│   ├── gateway/          # gRPC Gateway REST mappings
│   ├── domain/           # Business logic per module
│   │   ├── finance/
│   │   ├── habits/
│   │   ├── calendar/
│   │   ├── pomodoro/
│   │   ├── tasks/
│   │   └── notes/
│   ├── infra/            # Database, caching, external services
│   └── space/            # Multi-tenant space middleware
├── proto/                # Protocol buffer definitions
├── migrations/           # SQL migrations
└── docs/                 # Extended documentation
```

## 📖 API Overview

Saturn exposes both **gRPC** and **REST** endpoints. The API is organized by domain, with every request scoped to a Space via a `space-id` header or path parameter.

### Example: Create a Task

```bash
curl -X POST http://localhost:8080/api/v1/tasks \
  -H "Content-Type: application/json" \
  -H "Space-Id: your-space-uuid" \
  -d '{
    "title": "Review quarterly budget",
    "priority": "high",
    "due_date": "2026-07-15"
  }'
```

Full API documentation is available in the [`docs/`](./docs/) directory.

## 🤝 Contributing

Contributions are welcome! Here's how to get started:

1. **Fork** the repository
2. **Create** a feature branch (`git checkout -b feature/your-feature`)
3. **Commit** your changes (`git commit -m 'feat: add new feature'`)
4. **Push** to the branch (`git push origin feature/your-feature`)
5. Open a **Pull Request**

### Development Guidelines

- Follow [Go Code Review Comments](https://go.dev/doc/code-review)
- Use [Conventional Commits](https://www.conventionalcommits.org/) for commit messages
- Write tests for new features and bug fixes
- Update documentation as needed

### Getting Help

- Open an [Issue](../../issues) for bugs or feature requests
- Reach out via the project's communication channels

## 📄 License

This project is licensed under the [MIT License](./LICENSE).

---

**Built with ❤️ by [masterkeysrd](https://github.com/masterkeysrd)**
