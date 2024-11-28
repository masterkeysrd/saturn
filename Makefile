.PHONY: api services

ENV?=dev
FUNCTION?=
EVENT?=

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
		--port 3000 \
		--docker-network saturn-network

api/invoke:
	@echo "Invoking API..."
	sam local invoke $(FUNCTION) \
		--event $(EVENT) \
		--docker-network saturn-network

api/deploy:
	@echo "Deploying API..."
	sam deploy --config-env $(ENV)

services/start:
	@echo "Starting services..."
	docker compose -f deployments/docker-compose/services.yaml up -d

services/stop:
	@echo "Stopping services..."
	docker compose -f deployments/docker-compose/services.yaml down

services/clean:
	@echo "Cleaning services..."
	docker compose -f deployments/docker-compose/services.yaml down --volumes

NPM_WEB?=npm --prefix web
web/start:
	@echo "Starting web..."
	$(NPM_WEB) run dev

web/build:
	@echo "Building web..."
	$(NPM_WEB) run build

web/lint:
	@echo "Linting web..."
	$(NPM_WEB) run lint

web/preview:
	@echo "Previewing web..."
	$(NPM_WEB) run preview
