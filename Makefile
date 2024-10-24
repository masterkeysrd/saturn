.PHONY: api

generate:
	@echo "Generating code..."
	go generate ./...

api/build:
	@echo "Building API..."
	sam build

api/start:
	@echo "Starting API..."
	sam local start-api \
		--port 3000
