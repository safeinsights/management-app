DBGATE_COMPOSE_FILE=docker-compose.dbgate.yml

.PHONY: up down restart logs

startdbgate:
	docker-compose -f $(DBGATE_COMPOSE_FILE) up -d

stopdbgate:
	docker-compose -f $(DBGATE_COMPOSE_FILE) down

cleandbgate:
	docker compose -f $(DBGATE_COMPOSE_FILE) down --rmi local --volumes --remove-orphans
