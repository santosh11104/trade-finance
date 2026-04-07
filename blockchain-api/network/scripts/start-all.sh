#!/bin/bash
set -e

ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
NETWORK_DIR="${ROOT_DIR}/blockchain-api/network"
SCRIPTS_DIR="${NETWORK_DIR}/scripts"

function wait_for_container() {
  local name="$1"
  local attempts=20
  local delay=3

  echo "Waiting for container ${name} to be running..."
  for i in $(seq 1 ${attempts}); do
    if docker ps --filter "name=${name}" --filter "status=running" --format '{{.Names}}' | grep -q "${name}"; then
      echo "${name} is running"
      return 0
    fi
    echo "  attempt ${i}/${attempts}..."
    sleep ${delay}
  done

  echo "ERROR: ${name} did not start in time"
  return 1
}

function wait_for_peer() {
  local peer_name="$1"
  local attempts=30
  local delay=2

  echo "Waiting for peer ${peer_name} to fully initialize..."
  for i in $(seq 1 ${attempts}); do
    # Check peer logs for "Started peer" message indicating it's ready
    if docker logs "${peer_name}" 2>&1 | grep -q "Started peer"; then
      echo "${peer_name} is ready"
      return 0
    fi
    echo "  attempt ${i}/${attempts}..."
    sleep ${delay}
  done

  echo "ERROR: ${peer_name} did not become ready in time"
  return 1
}

cd "${NETWORK_DIR}"

echo "==> Starting PostgreSQL"
docker compose up -d postgres

wait_for_container tradefinance-postgres

cd "${SCRIPTS_DIR}"

echo "==> Starting Fabric network"
bash network-up.sh

wait_for_container orderer.example.com
wait_for_container peer0.org1.example.com
wait_for_container peer0.org2.example.com
wait_for_container peer0.org3.example.com
wait_for_container peer0.org4.example.com

# Wait for peers to be fully ready (CouchDB initialization takes time)
echo "==> Waiting for peers to fully initialize..."
wait_for_peer peer0.org1.example.com
wait_for_peer peer0.org2.example.com
wait_for_peer peer0.org3.example.com
wait_for_peer peer0.org4.example.com

# Additional delay to ensure all services are ready
echo "==> Waiting additional 10 seconds for stabilization..."
sleep 10

echo "==> Creating channel and joining all peers"
bash create-channel.sh

echo "==> Deploying chaincode"
bash deploy-chaincode.sh

echo "==> Setting up API wallet"
cd "${ROOT_DIR}/api" && node create-wallet.js

echo "==> Starting monitoring and observability services"
cd "${NETWORK_DIR}"
docker compose up -d prometheus grafana jaeger explorerdb.mynetwork.com explorer.mynetwork.com

echo "Waiting for services to initialize..."
sleep 10

echo "==> All Fabric deployment steps completed successfully"
echo ""
echo "PostgreSQL is running on port 5432"
echo "Fabric network is running"
echo "Wallet identity (appUser) is created"
echo ""
echo "Monitoring services:"
echo "  - Hyperledger Explorer: http://localhost:8082 (login: exploreradmin/exploreradminpw)"
echo "  - Grafana:              http://localhost:3000 (login: admin/admin)"
echo "  - Prometheus:           http://localhost:9090"
echo "  - Jaeger:               http://localhost:16686"
echo ""
echo "To start the API, run:"
echo "  cd ${ROOT_DIR}/api && npm start"

echo "To start the API and database separately, use the instructions in the repository README."

