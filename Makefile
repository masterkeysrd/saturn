# Saturn — Makefile
#
# Usage:
#   make build        Build the binary locally
#   make run          Run the binary locally
#   make test         Run all tests
#   make docker-build Build the Docker image
#   make docker-run   Run the Docker container
#   make compose-up   Start the compose stack
#   make compose-down Stop the compose stack
#   make compose-watch Start the compose stack in watch mode
#   make clean        Remove build artifacts
#   make help         Show this help

APP_NAME       := saturn
APP_DIR        := cmd/saturn
VERSION        ?= dev
IMAGE          := saturn
DOCKERFILE     := build/saturn/Dockerfile
COMPOSE_FILE   := deployments/docker-compose/app.yaml
BINARY         := bin/$(APP_NAME)

.DEFAULT_GOAL := help

## Build the binary locally
.PHONY: build
build:
	@echo "→ Building $(APP_NAME) (version=$(VERSION))"
	@mkdir -p bin
	go build \
		-ldflags="-s -w -X main.version=$(VERSION)" \
		-o $(BINARY) \
		./$(APP_DIR)

## Run the binary locally
.PHONY: run
run: build
	@$(BINARY) serve

## Run all tests
.PHONY: test
test:
	@echo "→ Running tests"
	go test -v -race ./...

## Build the Docker image
.PHONY: docker-build
docker-build:
	@echo "→ Building Docker image $(IMAGE):$(VERSION)"
	docker build \
		--build-arg VERSION=$(VERSION) \
		-t $(IMAGE):$(VERSION) \
		-f $(DOCKERFILE) \
		.

## Run the Docker container
.PHONY: docker-run
docker-run: docker-build
	@echo "→ Running container $(IMAGE):$(VERSION)"
	docker run --rm -it \
		--name saturn \
		-p 8080:8080 \
		$(IMAGE):$(VERSION)

## Start the compose stack
.PHONY: compose-up
compose-up:
	@echo "→ Starting compose stack"
	docker compose -f $(COMPOSE_FILE) up --build -d

## Start the compose stack in watch mode (auto-rebuild on code changes)
.PHONY: compose-watch
compose-watch:
	@echo "→ Starting compose stack in watch mode"
	docker compose -f $(COMPOSE_FILE) up --build --watch

## Stop the compose stack
.PHONY: compose-down
compose-down:
	@echo "→ Stopping compose stack"
	docker compose -f $(COMPOSE_FILE) down

## Remove build artifacts
.PHONY: clean
clean:
	@echo "→ Cleaning"
	rm -rf bin

## Show this help
.PHONY: help
help:
	@echo "Saturn Makefile targets:"
	@grep -E '^[a-zA-Z_-]+:.*## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS=":.*## "}; {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}'
