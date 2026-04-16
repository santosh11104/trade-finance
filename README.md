# Trade Finance LC Automation

This repository contains an enterprise-grade Hyperledger Fabric v2.5 implementation of a Letter of Credit (LC) automation system for trade finance.

## Overview

The system includes:
- Multi-organization Fabric network with Org1 (Importer), Org2 (Exporter), Org3 (Issuing Bank), Org4 (Advising/Confirming Bank)
- RAFT orderer with TLS enabled and Fabric CA for identity management
- A primary `tradechannel` plus private data collections for sensitive trade documents and risk data
- Go chaincode implementing the full LC lifecycle
- A Node.js REST API layer with JWT authentication, RBAC, and PostgreSQL integration
- CouchDB as the state database for rich queries
- Hyperledger Explorer for blockchain visibility
- Prometheus + Grafana for monitoring and metrics
- OpenTelemetry + Jaeger for distributed tracing
- Docker Compose deployment for local development

## Repository Structure

- `blockchain-api/network/` — Hyperledger Fabric network configuration, Docker deployment, and lifecycle scripts
- `blockchain-api/config/` — Fabric connection profile used by the API gateway
- `blockchain-api/network/explorer/` — Hyperledger Explorer configuration
- `blockchain-api/network/monitoring/` — Prometheus and Grafana configuration
- `chaincode/lc/` — Go chaincode source and private data collection definitions
- `api/` — Node.js REST API (Controller-Service-Repository architecture), authentication, Fabric gateway client, PostgreSQL sync (using pg-promise), and OpenTelemetry tracing
- `db/` — PostgreSQL schema and migration SQL
- `docs/` — API request collection and supporting documentation

## Prerequisites

- Docker Engine
- Docker Compose
- Node.js 18+
- PostgreSQL client (optional)

## Quick Start

Start the Fabric network, PostgreSQL, monitoring stack, create the channel, deploy chaincode, and set up the wallet in one command:

```bash
cd blockchain-api/network
bash scripts/start-all.sh
```

### One-command BC startup flow

This repository supports a fully automated Fabric network, chaincode, and observability stack launch sequence:

```bash
cd blockchain-api/network
bash scripts/start-all.sh
```

That single command performs:
- Fabric CA and peer startup
- CouchDB state database containers for all peers
- Channel creation for `tradechannel`
- Chaincode packaging, installation, approval, and commit across all orgs
- Monitoring stack startup (Prometheus, Grafana, Jaeger, Hyperledger Explorer)
- Wallet identity creation for the API

### Monitoring & Observability Stack

After running `start-all.sh`, the following services are available:

| Service | Port | URL | Description |
|---------|------|-----|-------------|
| **Hyperledger Explorer** | 8082 | http://localhost:8082 | Blockchain visibility (login: exploreradmin/exploreradminpw) |
| **Grafana** | 3000 | http://localhost:3000 | Metrics dashboards (login: admin/admin) |
| **Prometheus** | 9090 | http://localhost:9090 | Metrics collection |
| **Jaeger** | 16686 | http://localhost:16686 | Distributed tracing |
| **cAdvisor** | 8081 | http://localhost:8081 | Container metrics |
| **API Swagger** | 4000 | http://localhost:4000/api-docs | Interactive API documentation |

### API startup is manual

THe API server is intentionally not started automatically by `start-all.sh`.
Start the API separately once the Fabric network, chaincode, and monitoring stack are ready.

To start the API locally (after running `start-all.sh`):

```bash
cd api
npm start
```

The API will automatically initialize the database schema and seed test users with encrypted Fabric identities in the database on its first run.

Or run the API with an explicit database URL:

```bash
cd api
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tradefinance npm start
```

### Interactive API Documentation (Swagger)

The API includes built-in Swagger documentation for interactive testing.

- **URL:** [http://localhost:4000/api-docs](http://localhost:4000/api-docs)
- **Instructions:**
  1. Start the API (`npm start` in the `api` directory).
  2. Open the Swagger URL in your browser.
  3. Use the **Auth > /auth/login** endpoint with credentials (e.g., `importer1`/`password`) to obtain a JWT token.
  4. Click the **Authorize** button at the top of the page.
  5. Enter the token in the value field (e.g., just the token string).
  6. You can now test all LC lifecycle endpoints directly from the UI.

## API Endpoints

Supported endpoints:
- `GET /health` - Check API and Database health
- `POST /lc/create` - Create LC (Importer)
- `POST /lc/issue` - Issue LC with **two-phase endorsement** (Importer proposes, Issuing Bank approves)
- `POST /lc/advise` - Advise LC (Advising Bank)
- `POST /lc/confirm` - Confirm LC (Advising Bank)
- `POST /lc/ship` - Submit shipment documents (Exporter)
- `POST /lc/verify` - Verify documents (Issuing Bank)
- `POST /lc/pay` - Release payment with **two-phase endorsement** (Exporter proposes, Issuing Bank approves)
- `POST /lc/amend` - Amend LC (Importer/Issuing Bank)
- `POST /lc/cancel` - Cancel LC (Importer/Issuing Bank)
- `GET /lc/:id` - Query LC by ID
- `GET /lc/:id/history` - Get LC status history

### Two-Phase Endorsement Flow

Certain critical operations require **dual endorsement** for security:

| Operation | Phase 1 (Propose) | Phase 2 (Approve) | Final Status |
|-----------|-------------------|-------------------|--------------|
| `/lc/issue` | Importer (Org1) submits pricing | Issuing Bank (Org3) approves | `ISSUED` |
| `/lc/pay` | Exporter (Org2) requests payment | Issuing Bank (Org3) approves | `PAID` |

### Current LC Workflow Summary

| Step | Action | Status Result | Actor |
| :--- | :--- | :--- | :--- |
| 1 | `POST /lc/create` | `CREATED` | Importer (Org1) |
| 2 | `POST /lc/issue` (Phase 1) | `ISSUE_PENDING` | Importer (Org1) |
| 3 | `POST /lc/issue` (Phase 2) | `ISSUED` | Issuing Bank (Org3) |
| 4 | `POST /lc/advise` | `ADVISED` | Advising Bank (Org4) |
| 5 | `POST /lc/confirm` | `CONFIRMED` | Confirming Bank (Org4) |
| 6 | `POST /lc/ship` | `SHIPPED` | Exporter (Org2) |
| 7 | `POST /lc/verify` | `VERIFIED` | Issuing Bank (Org3) |
| 8 | `POST /lc/pay` (Phase 1) | `PAYMENT_PENDING` | Exporter (Org2) |
| 9 | `POST /lc/pay` (Phase 2) | `PAID` | Issuing Bank (Org3) |

**Intermediate States:**
- `ISSUE_PENDING` - Waiting for issuing bank approval
- `PAYMENT_PENDING` - Waiting for issuing bank approval

### LC Status Lifecycle

```
CREATED → ISSUE_PENDING → ISSUED → ADVISED → CONFIRMED → SHIPPED → VERIFIED → PAYMENT_PENDING → PAID
   ↓          ↓              ↓
CANCELLED  (can cancel)   (can amend at any point before PAID)
```

| Status | Description |
|--------|-------------|
| `CREATED` | LC created by Importer |
| `ISSUE_PENDING` | Awaiting Issuing Bank approval (two-phase) |
| `ISSUED` | LC issued by Issuing Bank |
| `ADVISED` | LC advised to Advising Bank |
| `CONFIRMED` | LC confirmed by Advising Bank |
| `SHIPPED` | Documents submitted by Exporter |
| `VERIFIED` | Documents verified by Issuing Bank |
| `PAYMENT_PENDING` | Awaiting Issuing Bank approval for payment (two-phase) |
| `PAID` | Payment released |
| `CANCELLED` | LC cancelled (terminal state) |

## GitHub / CI Ready

This repository includes a GitHub Actions workflow at `.github/workflows/ci.yml` that:
- checks out the repository
- installs API dependencies
- validates the Node package dependency tree

To push to GitHub:

```bash
git add .
git commit -m "Initial enterprise Trade Finance LC automation setup"
git branch -M main
git remote add origin <YOUR_GITHUB_URL>
git push -u origin main
```

## Security and Best Practices

- Sensitive data is kept in private collections, not on the public ledger.
- TLS is enabled throughout the Fabric network.
- JWT authentication secures the API layer.
- `.env` is excluded via `.gitignore`; use `.env.example` as a template.
- CouchDB is used as the state database for rich query support.

## How It Works

1. Importer (Org1) creates an LC request with `createLC()`.
2. **Two-phase issuance:**
   - Importer (Org1) proposes the LC using `issueLC()` with pricing data
   - Issuing Bank (Org3) approves to finalize issuance
   - Private pricing details kept in `pricingCollection`
3. Advising Bank (Org4) receives and confirms the LC via `adviseLC()` and `confirmLC()`.
4. Exporter (Org2) submits shipment documents through `submitDocuments()`, stored in `shipmentDocsCollection`.
5. Issuing Bank verifies the documents via `verifyDocuments()`.
6. **Two-phase payment:**
   - Exporter (Org2) proposes payment release via `releasePayment()`
   - Issuing Bank (Org3) approves to finalize payment
   - Payment details stored in `bankRiskCollection`
7. Amendments and cancellations support multi-party approval workflows.

## Organization Mapping

The Fabric network uses standard MSP names with the following business mapping:

| MSP | Organization | Role |
|-----|--------------|------|
| Org1MSP | Importer | Initiates LC requests |
| Org2MSP | Exporter | Receives LC, ships goods |
| Org3MSP | Issuing Bank | Issues and pays LC |
| Org4MSP | Advising/Confirming Bank | Validates and confirms LC |

## Enterprise Features Implemented

### 1. Two-Phase Endorsement Security
- Critical operations (`issueLC`, `releasePayment`) require **dual endorsement**
- Importer/Exporter proposes → Issuing Bank approves
- Prevents single-actor compromise from executing financial transactions
- Proposal state tracked on-chain with `IssueProposal` and `PaymentProposal` records

### 2. CouchDB State Database
Each peer has its own CouchDB container for rich query support, enabling complex queries on state data using JSON/Mango queries.

| Organization | URL | Web UI (Fauxton) | Username | Password |
| :--- | :--- | :--- | :--- | :--- |
| **Org1** | `http://localhost:5984` | `http://localhost:5984/_utils` | `admin` | `adminpw` |
| **Org2** | `http://localhost:6984` | `http://localhost:6984/_utils` | `admin` | `adminpw` |
| **Org3** | `http://localhost:7984` | `http://localhost:7984/_utils` | `admin` | `adminpw` |
| **Org4** | `http://localhost:8984` | `http://localhost:8984/_utils` | `admin` | `adminpw` |

### 3. Hyperledger Explorer
- Complete blockchain visibility via web interface
- View blocks, transactions, chaincode, and channel information
- Real-time monitoring of network activity
- Multi-organization support with role-based views

### 4. Monitoring Stack (Prometheus + Grafana)
- **Prometheus**: Time-series metrics collection
- **Grafana**: Pre-configured dashboards for Fabric monitoring
- **Node Exporter**: System-level metrics (CPU, memory, disk)
- **cAdvisor**: Container metrics and resource usage
- Pre-built dashboard showing service status and system resources

### 5. Distributed Tracing (OpenTelemetry + Jaeger)
- **OpenTelemetry**: Auto-instrumentation for API requests
- **Jaeger**: Trace visualization and request flow analysis
- Tracks requests across API → Fabric → Chaincode
- Supports HTTP, Express, and PostgreSQL tracing
- Environment variables configured for OTLP export

### 6. Private Data Collections
- `pricingCollection` is shared only between Org1 and Org3.
- `shipmentDocsCollection` is shared only between Org2 and Org4.
- `bankRiskCollection` is restricted to Org3.
- Private data collection policies enforce access control for sensitive trade documents.

### 7. Event Handling & Off-chain Sync
- Chaincode Event Listener listens for `LCEvent` events
- Syncs events to PostgreSQL audit logs
- Off-chain database (`lc_metadata` table) for fast queries
- Real-time metadata synchronization including proposal/approval tracking

## Notes

- All CouchDB instances are configured with authentication (admin/adminpw)
- Prometheus scrapes metrics every 15 seconds
- Jaeger accepts traces via OTLP on gRPC port 4317
- The API tracing module auto-instruments Express, HTTP, and PostgreSQL
- To view CouchDB data: `curl http://admin:adminpw@localhost:5984/_all_dbs`
