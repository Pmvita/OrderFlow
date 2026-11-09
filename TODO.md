# ✅ OrderFlow — TODO

Progress tracker for the build. Check items off as you go.

---

## 🏗️ Project Setup
- [x] Define service boundaries (order, inventory, customer, notification)
- [x] Scaffold each service as its own Node.js project
- [ ] Set up shared linting/formatting config across services
- [x] Set up `docker-compose.yaml` for local multi-service dev
- [ ] Set up local Kubernetes cluster (minikube/kind) for testing manifests *(manual / env-dependent)*
- [ ] Install an Ingress controller on the local cluster *(manual / env-dependent)*

## 🐳 Containerization
- [x] Write `Dockerfile` for order-service
- [x] Write `Dockerfile` for inventory-service
- [x] Write `Dockerfile` for customer-service
- [x] Write `Dockerfile` for notification-service
- [x] Use multi-stage builds to minimize image size
- [x] Push images to a container registry *(CI → GHCR on `main`; see `k8s/IMAGES.md`)*

## 🗄️ Database
- [x] Design schema per service (orders, inventory, customers)
- [x] Write migration files per service
- [x] Decide on shared Postgres instance vs. separate instances per service *(one Postgres, separate DBs)*
- [x] Seed sample data for local testing

## ⚙️ Service Implementation
- [x] `order-service` — CRUD endpoints for orders
- [x] `order-service` — call inventory-service internally on order creation
- [x] `order-service` — call notification-service after successful create
- [x] `order-service` — fail/rollback order if inventory decrement fails
- [x] `inventory-service` — stock check + adjustment endpoints
- [x] `customer-service` — customer profile endpoints
- [x] `notification-service` — order status notification trigger
- [x] Add `/healthz/live` and `/healthz/ready` endpoints to every service
- [x] Add input validation to all endpoints
- [x] Write unit tests per service *(beyond health-only)*

## ☸️ Kubernetes Manifests
- [x] Write `namespace.yaml`
- [x] Write `Deployment` manifest per service
- [x] Write `Service` manifest per service
- [x] Write `ConfigMap` manifest per service
- [x] Write `Secret` manifests for DB credentials
- [x] Write `Ingress` manifest routing all services by path
- [ ] Validate manifests with `kubectl apply --dry-run=client` *(requires cluster/kubectl context)*

## 💓 Health & Resilience
- [x] Configure liveness probes per Deployment
- [x] Configure readiness probes per Deployment
- [x] Tune probe timing (initialDelaySeconds, periodSeconds, failureThreshold)
- [x] Set resource requests/limits (CPU/memory) per container
- [ ] Test pod self-healing by manually killing a pod *(manual cluster demo)*

## 📈 Autoscaling
- [ ] Install/verify metrics-server on the cluster *(manual / env-dependent)*
- [x] Write `HorizontalPodAutoscaler` for order-service
- [x] Write `HorizontalPodAutoscaler` for inventory-service
- [x] Write `HorizontalPodAutoscaler` for customer-service
- [x] Write `HorizontalPodAutoscaler` for notification-service
- [ ] Load test to confirm scale-up behavior *(manual)*
- [ ] Confirm scale-down doesn't disrupt in-flight requests *(manual)*

## 🔄 Rolling Updates
- [x] Configure `RollingUpdate` strategy (maxSurge/maxUnavailable) per Deployment
- [ ] Test a rolling update with zero dropped requests *(manual cluster demo)*
- [ ] Test rollback via `kubectl rollout undo` *(manual)*
- [x] Document deployment/rollback procedure *(README)*

## 🧪 Testing & QA
- [x] Unit tests — per-service business logic
- [x] Integration tests — service-to-service calls (order → inventory) *(mocked unit + compose e2e)*
- [x] End-to-end test — compose script (`scripts/e2e-compose.sh`); Ingress e2e still manual
- [ ] Chaos test — kill pods mid-traffic, confirm no downtime *(manual)*

## 🚀 Deployment
- [x] Set up CI/CD pipeline (build → push image → apply manifests)
- [x] Set up staging namespace separate from production *(namespaces defined; deploy jobs use environments)*
- [ ] Smoke test after each deploy *(wired in CI; needs kubeconfig secrets)*
- [x] Document scaling + rollback runbook *(README)*

## 📄 Documentation
- [x] Write README.md with architecture diagrams
- [x] Document image tags (local `orderflow/*:latest` vs GHCR) — `k8s/IMAGES.md`
- [ ] Document API endpoints in more detail (OpenAPI/Swagger per service)
- [x] Document ConfigMap/Secret keys required per service
- [ ] Add CONTRIBUTING.md

---

## 🗺️ Future / Roadmap (post-MVP — out of scope for portfolio MVP)
- [ ] Add a service mesh (Istio/Linkerd) for mTLS + traffic policies
- [ ] Centralized logging (EFK/Loki stack)
- [ ] Distributed tracing (OpenTelemetry + Jaeger)
- [ ] Helm charts to replace raw manifests
- [ ] GitOps deployment via ArgoCD/Flux
- [ ] Network policies to restrict pod-to-pod traffic by default
- [ ] Stronger saga/compensation for multi-item inventory (outbox / 2PC)

**MVP boundary:** Compose e2e + raw K8s manifests are in scope. Mesh and Helm stay on the roadmap.

---

*Last updated: 2026-11-08*
