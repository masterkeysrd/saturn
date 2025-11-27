DOCKER-COMPOSE=docker compose

app/start:
	$(DOCKER-COMPOSE) -f deployments/docker-compose/app.yaml up \
		--build \
		--detach \
		--remove-orphans

app/stop:
	$(DOCKER-COMPOSE) -f deployments/docker-compose/app.yaml down
