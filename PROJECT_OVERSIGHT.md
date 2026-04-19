# Trade Finance: Letter of Credit (LC) Blockchain System

This project implements a multi-organization trade finance solution using **Hyperledger Fabric v2.5**, providing a secure, transparent, and automated lifecycle for Letters of Credit (LC).

## 1. Functional Overview

The system digitizes the traditional Letter of Credit process, ensuring that documents and payments are only released when pre-defined conditions are met by all parties.

### LC Lifecycle Flow

| Order | Actor | Action | Description | State |
| :--- | :--- | :--- | :--- | :--- |
| 1 | **Importer** | `POST /lc/create` | Initiates the LC request with terms and conditions. | `CREATED` |
| 2 | **Importer** | `POST /lc/issue` | Proposes specific pricing and private terms. | `ISSUE_PENDING` |
| 3 | **Issuing Bank** | `POST /lc/issue` | Approves the proposal and formally issues the LC. | `ISSUED` |
| 4 | **Advising Bank** | `POST /lc/advise` | Notifies the Exporter that the LC has been received. | `ADVISED` |
| 5 | **Confirming Bank** | `POST /lc/confirm` | Adds a second guarantee of payment to the Exporter. | `CONFIRMED` |
| 6 | **Exporter** | `POST /lc/ship` | Uploads hashes of shipping documents (Bill of Lading, etc). | `SHIPPED` |
| 7 | **Issuing Bank** | `POST /lc/verify` | Reviews and verifies the submitted document hashes. | `VERIFIED` |
| 8 | **Exporter** | `POST /lc/pay` | Requests payment release after verification. | `PAYMENT_PENDING` |
| 9 | **Issuing Bank** | `POST /lc/pay` | Executes the final payment release to the Exporter. | `PAID` |

---

## 2. Network Architecture

The network is a consortium of four distinct organizations, each with its own infrastructure and Certificate Authority (CA).

### Organization Setup
*   **Org1 (ImporterOrg):** Represents the buyer/importer.
*   **Org2 (ExporterOrg):** Represents the seller/exporter.
*   **Org3 (IssuingBankOrg):** The bank that provides the credit guarantee.
*   **Org4 (AdvisingBankOrg):** The bank that confirms and advises the LC to the exporter.

### Infrastructure Components
*   **Peers:** 1 Peer per organization (`peer0.orgX.example.com`).
*   **Orderer:** A single-node Raft orderer (`orderer.example.com`) for transaction sequencing.
*   **CAs:** 4 Certificate Authorities for identity management.
*   **Databases:** 
    *   **CouchDB:** Used as the State Database for peers, enabling complex rich queries.
    *   **PostgreSQL:** Used by the API layer for off-chain metadata indexing and fast searching.

---

## 3. Data Privacy & Collections

To handle sensitive financial data, the system utilizes **Fabric Private Data Collections (PDC)**. This ensures that while the LC status is public on the ledger, sensitive data is only shared with authorized parties.

*   **`pricingCollection`:** Shared among all 4 Orgs. Used for sensitive pricing terms that shouldn't be on the public ledger but are needed for audit by all banks.
*   **`shipmentDocsCollection`:** Restricted to **Org2 (Exporter)** and **Org4 (Advising Bank)**. Ensures private shipping details are only visible to the banks handling the cargo documents.
*   **`bankRiskCollection`:** Restricted to **Org3 (Issuing Bank)**. Used for internal risk assessment data.

---

## 4. Technical Stack

*   **Blockchain:** Hyperledger Fabric v2.5 (Go Chaincode).
*   **API Layer:** Node.js (Express) using the `@hyperledger/fabric-gateway` SDK.
*   **Identity:** Fabric CA for X.509 certificate management.
*   **DevOps:** Docker Compose for orchestration, Bash for network automation.

---

## 5. Deployment Guide

### Prerequisites
*   Docker and Docker Compose.
*   Go 1.20+ (for chaincode development).
*   Node.js 18+.

### Setup Sequence
1.  **Start Network:**
    ```bash
    ./blockchain-api/network/scripts/network-up.sh
    ```
    *Generates crypto material, genesis blocks, and starts containers.*

2.  **Create & Join Channel:**
    ```bash
    ./blockchain-api/network/scripts/create-channel.sh
    ```
    *Creates `tradechannel` and joins all 4 peers.*

3.  **Update Anchor Peers:**
    *Crucial for cross-org gossip and private data reconciliation.*
    ```bash
    # Run the set-anchor-peers logic to enable Org discovery
    ```

4.  **Deploy Chaincode:**
    ```bash
    ./blockchain-api/network/scripts/deploy-chaincode.sh
    ```
    *Packages, installs, approves (by all 4 orgs), and commits the `lccontract`.*

5.  **Start API:**
    ```bash
    cd api && npm install && npm start
    ```

---

## 6. Key Implementation Details

### Two-Phase Approvals
Transactions like `issueLC` and `releasePayment` use a proposal-approval pattern. 
1.  Party A submits a proposal (State changes to `PENDING`).
2.  Party B must submit the same transaction to confirm (State changes to `ISSUED`/`PAID`).
This ensures **transaction atomicity** and mutual agreement before financial movement.

### Anchor Peers & Gossip
The network is configured with Anchor Peers for each Org. This allows the gossip protocol to communicate across organization boundaries, which is essential for the **Private Data Reconciliation** used in the `advise` and `confirm` phases.

---

## 7. Security & Authorization

*   **Role-Based Access Control (RBAC):** The chaincode uses the `cid` (Client Identity) library to verify the caller's MSPID. For example, only `Org1MSP` can initiate an LC, and only `Org3MSP` can verify documents.
*   **Mutual TLS:** All communication between the API, Peers, and Orderer is encrypted using Mutual TLS (mTLS).
*   **Attribute-Based Access:** The API layer uses a custom `permit()` middleware to restrict endpoints based on the roles defined during Fabric CA enrollment.

---

## 8. Observability & Monitoring

The project includes a full monitoring stack to track network health and transaction throughput:

*   **Hyperledger Explorer:** Provides a web UI to view blocks, transactions, and chaincode activity (Port 8082).
*   **Prometheus & Grafana:** Collects and visualizes real-time metrics from the peers and orderers (Port 3000).
*   **Jaeger:** Implements distributed tracing for the API layer to identify bottlenecks in transaction submission.

---

## 9. Off-chain Data Synchronization

While the Blockchain is the source of truth, a **PostgreSQL** instance is maintained for fast lookups and complex filtering.
*   **Event Listener:** A dedicated service (`api/src/eventListener.js`) listens for `LCEvent` emissions from the chaincode.
*   **Reconciliation:** Every time a transaction is committed, the listener automatically updates the Postgres state, ensuring the UI/Dashboard always reflects the ledger without querying the blockchain for every list operation.
