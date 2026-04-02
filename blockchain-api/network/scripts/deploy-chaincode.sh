#!/bin/bash
set -e

ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
WORKDIR=/workspace/blockchain-api/network
CHANNEL_NAME=tradechannel
CHAINCODE_NAME=lccontract
CHAINCODE_LABEL=lccontract_1
CHAINCODE_PATH=../../chaincode/lc
CHAINCODE_PACKAGE=./chaincode-package/lccontract.tar.gz
DOCKER_NETWORK=network_default
ORDERER_ADDRESS=orderer.example.com:7050
ORDERER_TLS_CA=/workspace/blockchain-api/network/crypto-config/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem
USER_ID="$(id -u):$(id -g)"

mkdir -p "${ROOT_DIR}/blockchain-api/network/chaincode-package"

function run_peer() {
  docker run --rm -u "${USER_ID}" \
    --network ${DOCKER_NETWORK} \
    -v "${ROOT_DIR}":/workspace \
    -v /var/run/docker.sock:/var/run/docker.sock \
    -w "${WORKDIR}" \
    -e HOME=/tmp \
    -e GOCACHE=/tmp/.cache/go-build \
    -e FABRIC_CFG_PATH=/workspace/blockchain-api/network/config \
    -e CORE_PEER_TLS_ENABLED=true \
    -e CORE_PEER_LOCALMSPID="${CORE_PEER_LOCALMSPID}" \
    -e CORE_PEER_MSPCONFIGPATH="${CORE_PEER_MSPCONFIGPATH}" \
    -e CORE_PEER_TLS_ROOTCERT_FILE="${CORE_PEER_TLS_ROOTCERT_FILE}" \
    -e CORE_PEER_ADDRESS="${CORE_PEER_ADDRESS}" \
    hyperledger/fabric-tools:2.5 peer "$@"
}

function install_chaincode() {
  local MSP=$1
  local PEER_HOST=$2
  local ORG_DOMAIN=$3
  local PORT=$4
  local TLS_CERT_PATH=$5

  CORE_PEER_LOCALMSPID=${MSP}
  CORE_PEER_ADDRESS=${PEER_HOST}:${PORT}
  CORE_PEER_MSPCONFIGPATH="/workspace/blockchain-api/network/crypto-config/peerOrganizations/${ORG_DOMAIN}/users/Admin@${ORG_DOMAIN}/msp"
  CORE_PEER_TLS_ROOTCERT_FILE="/workspace/${TLS_CERT_PATH}"

  echo "Installing chaincode on ${PEER_HOST} (${MSP})"
  output=$(run_peer lifecycle chaincode install ${CHAINCODE_PACKAGE} 2>&1) || {
    if echo "$output" | grep -q "already successfully installed"; then
      echo "Chaincode already installed on ${PEER_HOST}, continuing"
      return 0
    fi
    echo "$output"
    return 1
  }
}

function approve_chaincode() {
  local MSP=$1
  local PEER_HOST=$2
  local ORG_DOMAIN=$3
  local PORT=$4
  local TLS_CERT_PATH=$5

  CORE_PEER_LOCALMSPID=${MSP}
  CORE_PEER_ADDRESS=${PEER_HOST}:${PORT}
  CORE_PEER_MSPCONFIGPATH="/workspace/blockchain-api/network/crypto-config/peerOrganizations/${ORG_DOMAIN}/users/Admin@${ORG_DOMAIN}/msp"
  CORE_PEER_TLS_ROOTCERT_FILE="/workspace/${TLS_CERT_PATH}"

  echo "Approving chaincode for ${MSP} at ${PEER_HOST}"
  run_peer lifecycle chaincode approveformyorg \
    --orderer ${ORDERER_ADDRESS} \
    --channelID ${CHANNEL_NAME} \
    --name ${CHAINCODE_NAME} \
    --version 1.0 \
    --package-id ${PACKAGE_ID} \
    --sequence 1 \
    --tls \
    --cafile ${ORDERER_TLS_CA} \
    --signature-policy "OR('Org1MSP.member','Org2MSP.member','Org3MSP.member','Org4MSP.member')" \
    --collections-config /workspace/chaincode/lc/collections_config.json \
    --validation-plugin vscc
}

echo "Pulling required chaincode environment image"
docker pull hyperledger/fabric-ccenv:2.5

echo "Packaging chaincode"
run_peer lifecycle chaincode package ${CHAINCODE_PACKAGE} --path ${CHAINCODE_PATH} --lang golang --label ${CHAINCODE_LABEL}

echo "Installing chaincode on all orgs"
install_chaincode Org1MSP peer0.org1.example.com org1.example.com 7051 blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
install_chaincode Org2MSP peer0.org2.example.com org2.example.com 8051 blockchain-api/network/crypto-config/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
install_chaincode Org3MSP peer0.org3.example.com org3.example.com 9051 blockchain-api/network/crypto-config/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt
install_chaincode Org4MSP peer0.org4.example.com org4.example.com 10051 blockchain-api/network/crypto-config/peerOrganizations/org4.example.com/peers/peer0.org4.example.com/tls/ca.crt

PACKAGE_ID=$(docker run --rm -u "${USER_ID}" --network ${DOCKER_NETWORK} \
  -v "${ROOT_DIR}":/workspace \
  -w "${WORKDIR}" \
  -e FABRIC_CFG_PATH=/workspace/blockchain-api/network/config \
  -e CORE_PEER_TLS_ENABLED=true \
  -e CORE_PEER_LOCALMSPID=Org1MSP \
  -e CORE_PEER_MSPCONFIGPATH=/workspace/blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp \
  -e CORE_PEER_TLS_ROOTCERT_FILE=/workspace/blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  -e CORE_PEER_ADDRESS=peer0.org1.example.com:7051 \
  hyperledger/fabric-tools:2.5 peer lifecycle chaincode queryinstalled | sed -n 's/Package ID: \(.*\), Label: lccontract_1/\1/p')

if [ -z "${PACKAGE_ID}" ]; then
  echo "Failed to determine chaincode package ID"
  exit 1
fi

echo "Approving chaincode for all orgs"
approve_chaincode Org1MSP peer0.org1.example.com org1.example.com 7051 blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
approve_chaincode Org2MSP peer0.org2.example.com org2.example.com 8051 blockchain-api/network/crypto-config/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt
approve_chaincode Org3MSP peer0.org3.example.com org3.example.com 9051 blockchain-api/network/crypto-config/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt
approve_chaincode Org4MSP peer0.org4.example.com org4.example.com 10051 blockchain-api/network/crypto-config/peerOrganizations/org4.example.com/peers/peer0.org4.example.com/tls/ca.crt

echo "Committing chaincode"
CORE_PEER_LOCALMSPID=Org1MSP
CORE_PEER_ADDRESS=peer0.org1.example.com:7051
CORE_PEER_MSPCONFIGPATH=/workspace/blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
CORE_PEER_TLS_ROOTCERT_FILE=/workspace/blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
run_peer lifecycle chaincode commit \
  -o ${ORDERER_ADDRESS} \
  --channelID ${CHANNEL_NAME} \
  --name ${CHAINCODE_NAME} \
  --version 1.0 \
  --sequence 1 \
  --tls \
  --cafile ${ORDERER_TLS_CA} \
  --signature-policy "OR('Org1MSP.member','Org2MSP.member','Org3MSP.member','Org4MSP.member')" \
  --collections-config /workspace/chaincode/lc/collections_config.json \
  --validation-plugin vscc \
  --peerAddresses peer0.org1.example.com:7051 \
  --tlsRootCertFiles /workspace/blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt \
  --peerAddresses peer0.org2.example.com:8051 \
  --tlsRootCertFiles /workspace/blockchain-api/network/crypto-config/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt \
  --peerAddresses peer0.org3.example.com:9051 \
  --tlsRootCertFiles /workspace/blockchain-api/network/crypto-config/peerOrganizations/org3.example.com/peers/peer0.org3.example.com/tls/ca.crt \
  --peerAddresses peer0.org4.example.com:10051 \
  --tlsRootCertFiles /workspace/blockchain-api/network/crypto-config/peerOrganizations/org4.example.com/peers/peer0.org4.example.com/tls/ca.crt

echo "Querying committed chaincode"
CORE_PEER_LOCALMSPID=Org1MSP
CORE_PEER_ADDRESS=peer0.org1.example.com:7051
CORE_PEER_MSPCONFIGPATH=/workspace/blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp
CORE_PEER_TLS_ROOTCERT_FILE=/workspace/blockchain-api/network/crypto-config/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt
run_peer lifecycle chaincode querycommitted --channelID ${CHANNEL_NAME} --name ${CHAINCODE_NAME}
