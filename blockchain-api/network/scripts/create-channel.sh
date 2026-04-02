#!/bin/bash
set -e

ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
WORKDIR=/workspace/blockchain-api/network
USER_ID="$(id -u):$(id -g)"
DOCKER_NETWORK=network_default
CHANNEL_NAME=tradechannel
ORDERER_ADDRESS=orderer.example.com:7050
CHANNEL_TX=./channel-artifacts/channel.tx

function run_peer() {
  docker run --rm -u "${USER_ID}" \
    --network ${DOCKER_NETWORK} \
    -v "${ROOT_DIR}":/workspace \
    -w "${WORKDIR}" \
    -e FABRIC_CFG_PATH=/workspace/blockchain-api/network/config \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_LOCALMSPID="${CORE_PEER_LOCALMSPID}" \
    -e CORE_PEER_MSPCONFIGPATH="/workspace/${CORE_PEER_MSPCONFIGPATH}" \
    -e CORE_PEER_TLS_ROOTCERT_FILE="/workspace/${CORE_PEER_TLS_ROOTCERT_FILE}" \
    -e CORE_PEER_ADDRESS="${CORE_PEER_ADDRESS}" \
    hyperledger/fabric-tools:2.5 peer "$@"
}

function createChannel() {
  local ORG_MSP=$1
  local PEER=$2
  local MSP_PATH=$3
  local PORT=$4
  local ORG_DOMAIN=$5

  CORE_PEER_LOCALMSPID=${ORG_MSP}
  CORE_PEER_MSPCONFIGPATH="blockchain-api/network/crypto-config/${MSP_PATH}/users/Admin@${ORG_DOMAIN}/msp"
  CORE_PEER_TLS_ROOTCERT_FILE="blockchain-api/network/config/tls-root-cas.pem"
  CORE_PEER_ADDRESS="${PEER}:${PORT}"

  if [ -f ./channel-artifacts/${CHANNEL_NAME}.block ]; then
    echo "Channel block already exists, skipping create"
    return
  fi

  echo "Creating channel block with ${PEER}"
  if ! run_peer channel create -o ${ORDERER_ADDRESS} -c ${CHANNEL_NAME} -f ${CHANNEL_TX} --outputBlock ./channel-artifacts/${CHANNEL_NAME}.block --tls --cafile /workspace/blockchain-api/network/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem; then
    echo "Channel already exists or create failed; fetching block instead"
    run_peer channel fetch 0 ./channel-artifacts/${CHANNEL_NAME}.block -o ${ORDERER_ADDRESS} -c ${CHANNEL_NAME} --tls --cafile /workspace/blockchain-api/network/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
  fi
}

function joinChannel() {
  local ORG_MSP=$1
  local PEER=$2
  local MSP_PATH=$3
  local PORT=$4
  local ORG_DOMAIN=$5

  CORE_PEER_LOCALMSPID=${ORG_MSP}
  CORE_PEER_MSPCONFIGPATH="blockchain-api/network/crypto-config/${MSP_PATH}/users/Admin@${ORG_DOMAIN}/msp"
  CORE_PEER_TLS_ROOTCERT_FILE="blockchain-api/network/config/tls-root-cas.pem"
  CORE_PEER_ADDRESS="${PEER}:${PORT}"

  echo "Joining ${PEER} to channel"
  run_peer channel join -b ./channel-artifacts/${CHANNEL_NAME}.block
}

echo "Creating channel with Org1 peer"
createChannel Org1MSP peer0.org1.example.com peerOrganizations/org1.example.com 7051 org1.example.com

echo "Joining Org1 peer"
joinChannel Org1MSP peer0.org1.example.com peerOrganizations/org1.example.com 7051 org1.example.com

echo "Joining Org2 peer"
joinChannel Org2MSP peer0.org2.example.com peerOrganizations/org2.example.com 8051 org2.example.com

echo "Joining Org3 peer"
joinChannel Org3MSP peer0.org3.example.com peerOrganizations/org3.example.com 9051 org3.example.com

echo "Joining Org4 peer"
joinChannel Org4MSP peer0.org4.example.com peerOrganizations/org4.example.com 10051 org4.example.com

echo "Peers joined channel ${CHANNEL_NAME}"
