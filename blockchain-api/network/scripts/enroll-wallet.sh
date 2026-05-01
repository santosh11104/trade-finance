#!/bin/bash
set -e

ROOT_DIR=$(cd "$(dirname "$0")/../../.." && pwd)
NETWORK_DIR="${ROOT_DIR}/blockchain-api/network"
WALLET_DIR="${ROOT_DIR}/api/wallet"

mkdir -p "${WALLET_DIR}"

# User configuration: username|msp|role|ca_port
USERS=(
  "admin|Org1MSP|admin|7054"
  "importer1|Org1MSP|admin|7054"
  "admin-org2|Org2MSP|admin|8054"
  "exporter1|Org2MSP|exporter|8054"
  "admin-org3|Org3MSP|admin|9054"
  "bank1|Org3MSP|bank|9054"
  "admin-org4|Org4MSP|admin|10054"
  "bank2|Org4MSP|bank|10054"
)

# Wait for CA servers to be reachable on the host
echo "==> Waiting for CA servers to be ready..."
for port in 7054 8054 9054 10054; do
  # We use a simple curl check from the host
  until curl -s "http://localhost:${port}/api/v1/ca" > /dev/null || curl -s "https://localhost:${port}/api/v1/ca" > /dev/null || true; do
    echo "  Waiting for CA on port ${port}..."
    sleep 2
  done
done
echo "==> All CA servers are responding."

for user_data in "${USERS[@]}"; do
  IFS='|' read -r username msp role port <<< "$user_data"

  case $msp in
    Org1MSP) ca_host="ca_org1"; registrar_wallet="admin" ;;
    Org2MSP) ca_host="ca_org2"; registrar_wallet="admin-org2" ;;
    Org3MSP) ca_host="ca_org3"; registrar_wallet="admin-org3" ;;
    Org4MSP) ca_host="ca_org4"; registrar_wallet="admin-org4" ;;
  esac

  # For bootstrap identities (names starting with admin), the CA identity is always 'admin'
  if [[ "$username" == admin* ]]; then
    ca_user="admin"
  else
    ca_user="$username"
  fi

  echo "==> Processing user: ${username} (CA identity: ${ca_user}, role: ${role})"

  # 1. Register user (SKIP for bootstrap identities)
  if [[ "$username" != admin* ]]; then
    echo "  Registering ${username} using ${registrar_wallet} as registrar..."
    docker run --rm \
      --network tradefinance \
      -e FABRIC_CA_CLIENT_TLS_SKIP_VERIFY=true \
      -v "${NETWORK_DIR}/crypto-config/peerOrganizations/${msp,,}.example.com/ca:/ca-certs" \
      -v "${WALLET_DIR}:/wallet" \
      hyperledger/fabric-ca:1.5 \
      fabric-ca-client register \
        --id.name "${ca_user}" \
        --id.secret "adminpw" \
        --id.type client \
        --id.affiliation "org1.department1" \
        --id.attrs "role=${role}" \
        --tls.certfiles /ca-certs/ca.${msp,,}.example.com-cert.pem \
        -u http://${ca_host}:7054 \
        --mspdir /wallet/${registrar_wallet}/msp || echo "User ${username} already registered"
  else
    echo "  Skipping registration for bootstrap identity ${username}..."
  fi

  # 2. Enroll user to get certificate and key
  echo "  Enrolling ${username} (as ${ca_user})..."
  docker run --rm \
    --network tradefinance \
    -e FABRIC_CA_CLIENT_TLS_SKIP_VERIFY=true \
    -v "${NETWORK_DIR}/crypto-config/peerOrganizations/${msp,,}.example.com/ca:/ca-certs" \
    -v "${WALLET_DIR}:/wallet" \
    hyperledger/fabric-ca:1.5 \
    fabric-ca-client enroll \
      -u http://${ca_user}:adminpw@${ca_host}:7054 \
      --tls.certfiles /ca-certs/ca.${msp,,}.example.com-cert.pem \
      --mspdir /wallet/${username}/msp
done

echo "==> Wallet setup complete. All identities created in ${WALLET_DIR}"

# Fix permissions so the host user can read the wallet
echo "==> Fixing wallet permissions..."
docker run --rm -v "${WALLET_DIR}:/wallet" alpine chown -R $(id -u):$(id -g) /wallet
