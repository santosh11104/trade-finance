# Trade Finance LC Automation

This repository contains an enterprise-grade Hyperledger Fabric v2.5 implementation of a Letter of Credit (LC) automation system for trade finance.

## Overview

The system includes:
- Multi-organization Fabric network with Org1 (Importer), Org2 (Exporter), Org3 (Issuing Bank), Org4 (Advising/Confirming Bank)
- RAFT orderer with TLS enabled and Fabric CA for identity management
- A primary `tradechannel` plus private data collections for sensitive trade documents and risk data
- Go chaincode implementing the full LC lifecycle
- A Node.js REST API layer with JWT authentication, RBAC, and PostgreSQL integration
- Docker Compose deployment for local development

## Repository Structure

- `blockchain-api/network/` — Hyperledger Fabric network configuration, Docker deployment, and lifecycle scripts
- `blockchain-api/config/` — Fabric connection profile used by the API gateway
- `chaincode/lc/` — Go chaincode source and private data collection definitions
- `api/` — Node.js REST API, authentication, Fabric gateway client, and PostgreSQL sync
- `db/` — PostgreSQL schema and migration SQL
- `docs/` — API request collection and supporting documentation

## Prerequisites

- Docker Engine
- Docker Compose
- Node.js 18+
- PostgreSQL client (optional)

## Quick Start

Start the Fabric network, create the channel, and deploy chaincode in one command:

```bash
cd blockchain-api/network
bash scripts/start-all.sh
```

### One-command BC startup flow

This repository supports a fully automated Fabric network and chaincode launch sequence:

```bash
cd blockchain-api/network
bash scripts/start-all.sh
```

That single command performs:
- Fabric CA and peer startup
- channel creation or fetch for `tradechannel`
- chaincode packaging, installation, approval, and commit across all orgs

### API startup is manual

The API is intentionally not started automatically by the Fabric network launcher.
Start the API separately once the Fabric network and chaincode are ready.

To launch the API and Postgres manually from the blockchain-api compose folder:

```bash
cd blockchain-api/network
docker compose up -d postgres api
```

Or run the API locally with an existing Postgres instance:

```bash
cd api
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tradefinance npm install
DATABASE_URL=postgres://postgres:postgres@localhost:5432/tradefinance npm start
```

## API Endpoints

Supported endpoints:
- `POST /lc/create`
- `POST /lc/issue`
- `POST /lc/confirm`
- `POST /lc/ship`
- `POST /lc/verify`
- `POST /lc/pay`
- `GET /lc/:id`

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

## How It Works

1. Importer (Org1) creates an LC request with `createLC()`.
2. Issuing Bank (Org3) issues the LC using `issueLC()` with private pricing details kept in `pricingCollection`.
3. Advising Bank (Org4) receives and confirms the LC via `adviseLC()` and `confirmLC()`.
4. Exporter (Org2) submits shipment documents through `submitDocuments()`, stored in `shipmentDocsCollection`.
5. Issuing Bank verifies the documents and releases payment via `verifyDocuments()` and `releasePayment()`.
6. Amendments and cancellations support multi-party approval workflows.

## Notes

- `pricingCollection` is shared only between Org1 and Org3.
- `shipmentDocsCollection` is shared only between Org2 and Org4.
- `bankRiskCollection` is restricted to Org3.
- Private data collection policies enforce access control for sensitive trade documents.
