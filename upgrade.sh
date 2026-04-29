#!/bin/bash

# --- Configuration ---
# Change these values to match your network environment
CHANNEL_NAME="mychannel"
CC_NAME="tradefinance"
CC_VERSION="1.0"
CC_PATH="./chaincode"
LABEL="tradefinance_1.0"
MSP_ID="Org1MSP"
PEER_ADDR="peer0.org1.example.com:7051"
PACKAGE_NAME="tradefinance.tar.gz"

# Sequence number - this must be incremented for every upgrade
# You can pass this as an argument to the script: ./upgrade.sh 2
SEQUENCE=${1:-1}

echo "Starting chaincode upgrade for $CC_NAME (Sequence: $SEQUENCE)..."

# 1. Package the chaincode
echo "Packaging chaincode..."
peer lifecycle chaincode package $PACKAGE_NAME \
  --path $CC_PATH \
  --lang golang \
  --label $LABEL

if [ $? -ne 0 ]; then echo "Packaging failed"; exit 1; fi

# 2. Install the chaincode
echo "Installing chaincode..."
peer lifecycle chaincode install $PACKAGE_NAME

if [ $? -ne 0 ]; then echo "Installation failed"; exit 1; fi

# Extract Package ID automatically
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep "$LABEL" | awk '{print $1}')
echo "Installed Package ID: $PACKAGE_ID"

if [ -z "$PACKAGE_ID" ]; then echo "Could not find Package ID"; exit 1; fi

# 3. Approve the chaincode definition
echo "Approving chaincode definition..."
peer lifecycle chaincode approveformyorg \
  --channelID $CHANNEL_NAME \
  --name $CC_NAME \
  --version $CC_VERSION \
  --package-id $PACKAGE_ID \
  --sequence $SEQUENCE \
  --signature "MSP:$MSP_ID"

if [ $? -ne 0 ]; then echo "Approval failed"; exit 1; fi

# 4. Commit the chaincode definition
echo "Committing chaincode definition..."
peer lifecycle chaincode commit \
  --channelID $CHANNEL_NAME \
  --name $CC_NAME \
  --version $CC_VERSION \
  --sequence $SEQUENCE \
  --peerAddresses $PEER_ADDR

if [ $? -ne 0 ]; then echo "Commit failed"; exit 1; fi

echo "--------------------------------------------------"
echo "Chaincode $CC_NAME successfully upgraded to sequence $SEQUENCE!"
echo "--------------------------------------------------"
