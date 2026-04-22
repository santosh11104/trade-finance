# Production Deployment Preparation Guide

This document outlines the steps to move the Trade Finance application from a local Docker Compose environment to a production-ready Kubernetes (K8s) or OpenShift cluster.

## 1. Prerequisites
- **Kubernetes Cluster:** Access to a cluster (e.g., Oracle Cloud, AWS EKS, or local Kind/Minikube).
- **Container Registry:** A place to store your images (e.g., Docker Hub, GitHub Packages, or AWS ECR).
- **HLF Operator:** Recommended for managing the Fabric Peer/Orderer infrastructure on K8s.

## 2. Build and Push Images
You must build the Docker images and push them to your registry so the cluster can pull them.

### API Image
```bash
docker build -t your-registry/trade-finance-api:v1 ./api
docker push your-registry/trade-finance-api:v1
```

### Chaincode Image (CCaaS)
```bash
docker build -t your-registry/lc-chaincode:v1 ./chaincode/lc
docker push your-registry/lc-chaincode:v1
```

## 3. Configure Kubernetes Infrastructure
Before deploying the apps, you must inject the configuration and secrets.

### Create Database Secret
```bash
kubectl create secret generic db-secrets \
  --from-literal=url="postgres://user:password@db-host:5432/tradefinance"
```

### Create Fabric Connection ConfigMap
```bash
kubectl create configmap fabric-connection-config \
  --from-file=connection.json=./blockchain-api/config/connection-profile-prod.json
```

## 4. The "Production Switch"
The application behaves differently based on these environment variables set in `deploy/k8s/api.yaml`:

| Variable | Local Value | Production Value | Why? |
| :--- | :--- | :--- | :--- |
| `FABRIC_DISCOVERY_AS_LOCALHOST` | `true` | `false` | K8s uses internal DNS (e.g., `peer0.org1`) instead of `localhost`. |
| `FABRIC_CONNECTION_PROFILE` | (Default path) | `/etc/fabric/connection.json` | Prod profile is mounted via ConfigMap. |
| `NODE_ENV` | `development` | `production` | Enables production optimizations in Node.js. |

## 5. Deployment Steps
Apply the manifests in the following order:

1. **Deploy Chaincode:**
   ```bash
   kubectl apply -f deploy/k8s/chaincode.yaml
   ```
   *Note: Obtain the Chaincode ID from the Peer and update the `CHAINCODE_ID` env var in the YAML before applying.*

2. **Deploy API:**
   ```bash
   kubectl apply -f deploy/k8s/api.yaml
   ```

## 6. Verification
- **Check Pods:** `kubectl get pods`
- **Check Logs:** `kubectl logs -f deployment/trade-finance-api`
- **Access API:** Get the external IP from `kubectl get svc trade-finance-api-service`.

## 7. Security Reminders
- Ensure `tls-root-cas.pem` is NOT in your Docker images (it should be mounted via ConfigMap if needed).
- Use a Private Container Registry.
- Restrict `DATABASE_URL` access using K8s Network Policies.
