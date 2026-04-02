#!/bin/bash
set -e

ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
COMPOSE_FILE="${ROOT_DIR}/blockchain-api/network/docker-compose.yml"

function docker_compose() {
  docker compose -f "${COMPOSE_FILE}" "$@" || docker-compose -f "${COMPOSE_FILE}" "$@"
}

echo "Tearing down network and removing containers"
docker_compose down --volumes --remove-orphans

echo "Cleaning generated artifacts"
docker run --rm -v "${ROOT_DIR}/blockchain-api/network":/workspace -w /workspace alpine sh -c 'rm -rf crypto-config channel-artifacts peer-artifacts chaincode-package || true'
