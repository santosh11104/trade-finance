#!/bin/bash
set -e

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
COMPOSE_FILE="${ROOT_DIR}/network/docker-compose.yml"

function docker_compose() {
  docker compose -f "${COMPOSE_FILE}" "$@" || docker-compose -f "${COMPOSE_FILE}" "$@"
}

echo "Tearing down network and removing containers"
docker_compose down --volumes --remove-orphans

echo "Cleaning generated artifacts"
rm -rf "${ROOT_DIR}/network/crypto-config" "${ROOT_DIR}/network/channel-artifacts" "${ROOT_DIR}/network/chaincode-package"
