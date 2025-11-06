DOCKER-COMPOSE=docker compose

app/start:
	$(DOCKER-COMPOSE) -f deployments/docker-compose/app.yaml up \
		--build \
		--detach \
		--remove-orphans
