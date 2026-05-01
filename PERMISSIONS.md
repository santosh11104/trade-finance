# System Permissions & Access Control Matrix

This document outlines the access control mapping between the API layer and the Hyperledger Fabric chaincode for the Trade Finance LC system.

## 1. Permission Matrix

The system employs a "Double Lock" security mechanism. A request must pass both the API Role check (Database) and the Blockchain Identity check (Certificate) to be successful.

| Endpoint | API Role Access | Chaincode MSP Requirement | Chaincode Role Requirement | Primary Actor |
| :--- | :--- | :--- | :--- | :--- |
| **POST /create** | importer, admin | `Org1MSP` | `admin` | Importer Admin |
| **POST /issue** | importer, bank, admin | `Org3MSP` (to approve) | `admin` (to approve) | Issuing Bank |
| **POST /advise** | bank, admin | `Org4MSP` | `admin` | Advising Bank |
| **POST /confirm** | bank, admin | `Org4MSP` | `admin` | Advising Bank |
| **POST /ship** | exporter, admin | `Org2MSP` | `operator` | Exporter Operator |
| **POST /verify** | bank, admin | `Org3MSP` | `admin` | Issuing Bank |
| **POST /pay** | exporter, bank, admin | `Org3MSP` (to finalize) | `admin` (to finalize) | Issuing Bank |
| **POST /amend** | importer, bank, admin | N/A | N/A | Any Authorized |
| **POST /cancel** | importer, bank, admin | N/A | N/A | Any Authorized |
| **GET / (list)** | all roles | N/A (Read only) | N/A | All |
| **GET /:id** | all roles | N/A (Read only) | N/A | All |
| **GET /:id/history**| all roles | N/A (Read only) | N/A | All |

---

## 2. Detailed Role Analysis

### `admin`
- **Capabilities**: Highest privilege. Can access almost every endpoint across different organizations.
- **Crucial for**: Initial LC creation, approving issues, advising, confirming, and verifying.
- **Identity Requirement**: Must have `role=admin` attribute in the X.509 certificate.

### `importer`
- **Capabilities**: Can create LCs (provided they also have the `admin` attribute), propose issues, amend, and cancel LCs.
- **Restriction**: Cannot verify documents or release payments.

### `exporter`
- **Capabilities**: Can submit shipping documents (`/ship`), propose payments, and view LC details.
- **Restriction**: Cannot create or issue LCs.

### `bank`
- **Capabilities**: Can issue, advise, confirm, and verify LCs, as well as finalize payments.
- **Restriction**: Cannot ship documents.

---

## 3. Security Enforcement Logic

### API Layer (`api/src/routes/lc.js`)
Enforced via the `permit(...)` middleware. This checks the `role` column in the `users` table of the PostgreSQL database.

### Blockchain Layer (`chaincode/lc/lc.go` & `auth.go`)
Enforced via the `cid` (Client Identity) library.
- `assertMSP(...)`: Verifies the caller belongs to the required Organization (MSP).
- `checkRole(...)`: Verifies the caller's certificate contains the required role attribute.

**Note**: If there is a mismatch between the Database role and the Certificate attribute, the API may allow the request, but the Blockchain will return a `500` error (e.g., "only Importer Admin can create LC").
