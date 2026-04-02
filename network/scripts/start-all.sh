#!/bin/bash
set -e

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
NETWORK_DIR="${ROOT_DIR}/network"
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

cd "${SCRIPTS_DIR}"

echo "==> Starting Fabric network"
bash network-up.sh

wait_for_container orderer.example.com
wait_for_container peer0.org1.example.com
wait_for_container peer0.org2.example.com
wait_for_container peer0.org3.example.com
wait_for_container peer0.org4.example.com

echo "==> Creating channel and joining all peers"
bash create-channel.sh

echo "==> Deploying chaincode"
bash deploy-chaincode.sh

echo "==> Starting Postgres and API services"
docker compose -f "${NETWORK_DIR}/docker-compose.yml" up -d postgres api || docker-compose -f "${NETWORK_DIR}/docker-compose.yml" up -d postgres api

wait_for_container tradefinance-postgres
wait_for_container tradefinance-api

echo "==> All deployment steps completed successfully"

echo "API is available at http://localhost:4000"

echo "If you prefer to run the API locally, use 'DATABASE_URL=postgres://postgres:postgres@localhost:5432/tradefinance npm start' from the api directory"
