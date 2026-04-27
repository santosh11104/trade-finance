#!/bin/bash
set -e

# Color codes for better visibility
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
NETWORK_DIR="${ROOT_DIR}/blockchain-api/network"
SCRIPTS_DIR="${NETWORK_DIR}/scripts"

function log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

function log_success() {
  echo -e "${GREEN}[SUCCESS]${NC} $1"
}

function log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

function log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

function wait_for_container() {
  local name="$1"
  local attempts=20
  local delay=3

  log_info "Waiting for container ${name} to be running..."
  for i in $(seq 1 ${attempts}); do
    if docker ps --filter "name=${name}" --filter "status=running" --format '{{.Names}}' | grep -q "${name}"; then
      log_success "${name} is running"
      return 0
    fi
    echo "  attempt ${i}/${attempts}..."
    sleep ${delay}
  done

  log_error "${name} did not start in time"
  return 1
}

function wait_for_peer() {
  local peer_name="$1"
  local attempts=30
  local delay=2

  log_info "Waiting for peer ${peer_name} to fully initialize..."
  for i in $(seq 1 ${attempts}); do
    if docker logs "${peer_name}" 2>&1 | grep -q "Started peer"; then
      log_success "${peer_name} is ready"
      return 0
    fi
    echo "  attempt ${i}/${attempts}..."
    sleep ${delay}
  done

  log_error "${peer_name} did not become ready in time"
  return 1
}

cd "${NETWORK_DIR}"

echo -e "${BLUE}======================================================================${NC}"
echo -e "${BLUE}   STARTING TRADE FINANCE HYPERLEDGER FABRIC NETWORK                 ${NC}"
echo -e "${BLUE}======================================================================${NC}"

log_info "Starting PostgreSQL database..."
docker compose --env-file "${ROOT_DIR}/.env" up -d postgres
wait_for_container tradefinance-postgres

cd "${SCRIPTS_DIR}"

log_info "Launching Fabric network components..."
bash network-up.sh

wait_for_container orderer.example.com
wait_for_container peer0.org1.example.com
wait_for_container peer0.org2.example.com
wait_for_container peer0.org3.example.com
wait_for_container peer0.org4.example.com

log_info "Waiting for peers to fully initialize (CouchDB state database)..."
wait_for_peer peer0.org1.example.com
wait_for_peer peer0.org2.example.com
wait_for_peer peer0.org3.example.com
wait_for_peer peer0.org4.example.com

log_warn "Waiting additional 10 seconds for stabilization..."
sleep 10

log_info "Creating channel and joining all peers..."
bash create-channel.sh

log_info "Resetting chaincode version for fresh deployment..."
rm -f "${SCRIPTS_DIR}/.cc_version"

log_info "Deploying Letter of Credit chaincode..."
bash deploy-chaincode.sh

log_info "Setting up API wallet and identities..."
cd "${ROOT_DIR}/api" && node create-wallet.js
log_info "Synchronizing database identities with network certificates..."
cd "${ROOT_DIR}/api" && node sync-db-with-crypto.js

log_info "Starting monitoring and observability services (Explorer, Grafana, Jaeger, Loki, Promtail)..."
cd "${NETWORK_DIR}"
docker compose --env-file "${ROOT_DIR}/.env" up -d prometheus grafana jaeger explorerdb.mynetwork.com explorer.mynetwork.com loki promtail

log_info "Finalizing services initialization..."
sleep 10

echo -e "${GREEN}======================================================================${NC}"
echo -e "${GREEN}   FABRIC DEPLOYMENT COMPLETED SUCCESSFULLY                          ${NC}"
echo -e "${GREEN}======================================================================${NC}"
echo ""
echo -e "Database:    PostgreSQL running on port 5432"
echo -e "Network:     Hyperledger Fabric network is operational"
echo -e "Identity:    Wallet identity (appUser) has been created"
echo ""
echo -e "Monitoring Access:"
echo -e "  - Hyperledger Explorer: ${BLUE}http://localhost:8082${NC} (login: exploreradmin/exploreradminpw)"
echo -e "  - Grafana:              ${BLUE}http://localhost:3000${NC} (login: admin/admin)"
echo -e "  - Prometheus:           ${BLUE}http://localhost:9090${NC}"
echo -e "  - Jaeger:               ${BLUE}http://localhost:16686${NC}"
echo ""
echo -e "To start the API, run:"
echo -e "  ${YELLOW}cd ${ROOT_DIR}/api && npm start${NC}"
echo ""

