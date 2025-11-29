# Quick commands
.PHONY: verify migrate deploy_functions deploy

verify:
	./scripts/verify_env.sh

migrate:
	./scripts/migrate.sh

deploy_functions:
	./scripts/deploy_functions.sh

deploy: verify migrate deploy_functions
	@echo "Done."
