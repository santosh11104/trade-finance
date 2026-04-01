#!/bin/bash
set -e

ROOT_DIR=$(cd "$(dirname "$0")/../.." && pwd)
WORKDIR=/workspace/network
DOCKER_NETWORK=network_default
CHANNEL_NAME=tradechannel
ORDERER_ADDRESS=orderer.example.com:7050
CHANNEL_TX=./channel-artifacts/channel.tx

function run_peer() {
  docker run --rm \
    --network ${DOCKER_NETWORK} \
    -v "${ROOT_DIR}":/workspace \
    -w "${WORKDIR}" \
    -e FABRIC_CFG_PATH=/workspace/network/config \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_LOCALMSPID="${CORE_PEER_LOCALMSPID}" \
    -e CORE_PEER_MSPCONFIGPATH="/workspace/${CORE_PEER_MSPCONFIGPATH}" \
    -e CORE_PEER_TLS_ROOTCERT_FILE="/workspace/${CORE_PEER_TLS_ROOTCERT_FILE}" \
    -e CORE_PEER_ADDRESS="${CORE_PEER_ADDRESS}" \
    hyperledger/fabric-tools:2.5 peer "$@"
}

function joinChannel() {
  local ORG_MSP=$1
  local PEER=$2
  local MSP_PATH=$3
  local PORT=$4
  local ORG_DOMAIN=$5

  CORE_PEER_LOCALMSPID=${ORG_MSP}
  CORE_PEER_MSPCONFIGPATH="network/crypto-config/${MSP_PATH}/users/Admin@${ORG_DOMAIN}/msp"
  CORE_PEER_TLS_ROOTCERT_FILE="network/config/tls-root-cas.pem"
  CORE_PEER_ADDRESS="${PEER}:${PORT}"

  echo "Creating or fetching channel block for ${PEER}"
  run_peer channel create -o ${ORDERER_ADDRESS} -c ${CHANNEL_NAME} -f ${CHANNEL_TX} --outputBlock ./channel-artifacts/${CHANNEL_NAME}.block --tls --cafile /workspace/network/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem || true
  run_peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block
}

echo "Joining Org1 peer"
joinChannel Org1MSP peer0.org1.example.com peerOrganizations/org1.example.com 7051 org1.example.com

echo "Joining Org2 peer"
joinChannel Org2MSP peer0.org2.example.com peerOrganizations/org2.example.com 8051 org2.example.com

echo "Joining Org3 peer"
joinChannel Org3MSP peer0.org3.example.com peerOrganizations/org3.example.com 9051 org3.example.com

echo "Joining Org4 peer"
joinChannel Org4MSP peer0.org4.example.com peerOrganizations/org4.example.com 10051 org4.example.com

echo "Peers joined channel ${CHANNEL_NAME}"
