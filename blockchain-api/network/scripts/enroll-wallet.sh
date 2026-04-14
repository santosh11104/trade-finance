#!/bin/bash
set -e

ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
NETWORK_DIR="${ROOT_DIR}/blockchain-api/network"
WALLET_DIR="${ROOT_DIR}/api/wallet"

# Create wallet directory if it doesn't exist
mkdir -p "${WALLET_DIR}"

# Use fabric-ca-client docker image to enroll identities
echo "==> Enrolling Org1 CA admin"
docker run --rm \
  --network host \
  -v "${NETWORK_DIR}/crypto-config/peerOrganizations/org1.example.com/ca:/ca-certs" \
  -v "${WALLET_DIR}:/wallet" \
  hyperledger/fabric-ca:1.5 \
  fabric-ca-client enroll \
    -u https://admin:adminpw@localhost:7054 \
    --tls.certfiles /ca-certs/ca.org1.example.com-cert.pem \
    --mspdir /wallet/org1admin

echo "==> Registering appUser"
docker run --rm \
  --network host \
  -v "${NETWORK_DIR}/crypto-config/peerOrganizations/org1.example.com/ca:/ca-certs" \
  -v "${WALLET_DIR}:/wallet" \
  hyperledger/fabric-ca:1.5 \
  fabric-ca-client register \
    --id.name appUser \
    --id.secret appUserSecret \
    --id.type client \
    --id.affiliation org1.department1 \
    --tls.certfiles /ca-certs/ca.org1.example.com-cert.pem \
    --mspdir /wallet/org1admin \
    -u https://localhost:7054

echo "==> Enrolling appUser"
docker run --rm \
  --network host \
  -v "${NETWORK_DIR}/crypto-config/peerOrganizations/org1.example.com/ca:/ca-certs" \
  -v "${WALLET_DIR}:/wallet" \
  hyperledger/fabric-ca:1.5 \
  fabric-ca-client enroll \
    -u https://appUser:appUserSecret@localhost:7054 \
    --tls.certfiles /ca-certs/ca.org1.example.com-cert.pem \
    --mspdir /wallet/appUser

echo "==> Wallet setup complete. Identities created in ${WALLET_DIR}"
