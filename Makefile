.PHONY: api services

generate:
	@echo "Generating code..."
	go generate ./...

api: api/build api/start

api/build:
	@echo "Building API..."
	sam build

api/start:
	@echo "Starting API..."
	sam local start-api \
		--port 3000

services/start:
	@echo "Starting services..."
	docker compose -f deployments/docker-compose/services.yaml up -d

services/stop:
	@echo "Stopping services..."
	docker compose -f deployments/docker-compose/services.yaml down

services/clean:
	@echo "Cleaning services..."
	docker compose -f deployments/docker-compose/services.yaml down --volumes

