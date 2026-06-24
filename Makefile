VERSION ?= latest
DOCKER_IMAGE = olivilo23/videostallone

# Vollständiger Release: git push + Docker build + Docker push
# Verwendung: make release VERSION=v0.2.2
release:
	@echo "→ Git push..."
	git push origin main
	@echo "→ Docker build ($(VERSION) + latest)..."
	docker build --platform linux/amd64 \
		-t $(DOCKER_IMAGE):$(VERSION) \
		-t $(DOCKER_IMAGE):latest \
		.
	@echo "→ Docker push..."
	docker push $(DOCKER_IMAGE):$(VERSION)
	docker push $(DOCKER_IMAGE):latest
	@echo "✓ Release $(VERSION) fertig: GitHub + Docker Hub aktualisiert"

# Nur Docker (wenn git schon gepusht ist)
docker:
	docker build --platform linux/amd64 \
		-t $(DOCKER_IMAGE):$(VERSION) \
		-t $(DOCKER_IMAGE):latest \
		.
	docker push $(DOCKER_IMAGE):$(VERSION)
	docker push $(DOCKER_IMAGE):latest

.PHONY: release docker
