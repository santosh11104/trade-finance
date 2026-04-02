#!/bin/bash
set -e

ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
NETWORK_DIR="${ROOT_DIR}/blockchain-api/network"
COMPOSE_FILE="${NETWORK_DIR}/docker-compose.yml"
export FABRIC_CFG_PATH="${NETWORK_DIR}/config"

function docker_compose() {
  docker compose -f "${COMPOSE_FILE}" "$@" || docker-compose -f "${COMPOSE_FILE}" "$@"
}

USER_ID="$(id -u):$(id -g)"

function fabric_tool() {
  docker run --rm -u "${USER_ID}" -v "${ROOT_DIR}":/workspace -w /workspace/blockchain-api/network -e FABRIC_CFG_PATH=/workspace/blockchain-api/network/config hyperledger/fabric-tools:2.5 "$@"
}

echo "==> Cleaning existing generated network artifacts"
docker run --rm -v "${NETWORK_DIR}":/workspace -w /workspace alpine sh -c 'rm -rf crypto-config channel-artifacts peer-artifacts chaincode-package || true'

echo "==> Generate crypto material using cryptogen for MSP directories"
mkdir -p "${NETWORK_DIR}/crypto-config" "${NETWORK_DIR}/channel-artifacts"
fabric_tool cryptogen generate --config=config/crypto-config.yaml --output=crypto-config

echo "==> Create combined TLS root CA bundle"
cat "${NETWORK_DIR}/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/tls/ca.crt" \
    "${NETWORK_DIR}/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
    "${NETWORK_DIR}/crypto-config/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
    "${NETWORK_DIR}/crypto-config/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt" \
    "${NETWORK_DIR}/crypto-config/peerOrganizations/org4.example.com/peers/peer0.org4.example.com/tls/ca.crt" > "${NETWORK_DIR}/config/tls-root-cas.pem"

echo "==> Generate genesis block and channel configuration"
fabric_tool configtxgen --profile TradeChannel --channelID tradechannel --outputCreateChannelTx ./channel-artifacts/channel.tx
fabric_tool configtxgen --profile TradeGenesis --channelID system-channel --outputBlock ./channel-artifacts/genesis.block

echo "==> Bring up Fabric CA servers and peers"
docker_compose up -d ca_org1 ca_org2 ca_org3 ca_org4 orderer.example.com peer0.org1.example.com peer0.org2.example.com peer0.org3.example.com peer0.org4.example.com

echo "==> Network is starting. Use scripts/create-channel.sh to join peers to channel."

