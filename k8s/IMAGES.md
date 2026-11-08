# Container image tags

Manifests under `k8s/*/deployment.yaml` use **local** image names for kind/minikube/Docker Desktop:

| Service | Local tag (manifests) |
|---|---|
| order-service | `orderflow/order-service:latest` |
| inventory-service | `orderflow/inventory-service:latest` |
| customer-service | `orderflow/customer-service:latest` |
| notification-service | `orderflow/notification-service:latest` |

`imagePullPolicy: IfNotPresent` so a locally built/loaded image is used without pulling from a registry.

## CI / GHCR (GitHub Actions)

On push to `main`, CI builds and pushes:

```text
ghcr.io/<owner>/<repo>/<service>:<git-sha>
ghcr.io/<owner>/<repo>/<service>:latest
```

Example (replace owner/repo):

```text
ghcr.io/acme/orderflow/order-service:abc123def
ghcr.io/acme/orderflow/order-service:latest
```

Deploy jobs then run `kubectl set image` to the **immutable `:sha` tag** (not `:latest`) so rollouts are reproducible.

## Local cluster load (kind example)

```bash
for s in order-service inventory-service customer-service notification-service; do
  docker build -t orderflow/$s:latest ./services/$s
  kind load docker-image orderflow/$s:latest
done
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secrets.yaml
kubectl apply -f k8s/order-service/ -f k8s/inventory-service/ \
  -f k8s/customer-service/ -f k8s/notification-service/
kubectl apply -f k8s/ingress.yaml
```
