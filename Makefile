DOCKER-COMPOSE=docker compose
BUF_CMD=docker run --rm -v $(PWD):/workspace -v ~/.config/buf:/root/.config/buf -v ~/.cache/buf:/root/.cache/buf -w /workspace saturn/buf:latest

deps: proto/deps

lint: proto/lint

generate: proto/generate

app/start:
	$(DOCKER-COMPOSE) -f deployments/docker-compose/app.yaml watch

app/stop:
	$(DOCKER-COMPOSE) -f deployments/docker-compose/app.yaml down

buf/build-image:
	docker build \
		--file build/buf/Dockerfile \
		--tag saturn/buf:latest \
		.

proto/build:
	$(BUF_CMD) build

proto/lint:
	$(BUF_CMD) lint

proto/generate:
	$(BUF_CMD) generate

proto/deps:
	$(BUF_CMD) dep update
