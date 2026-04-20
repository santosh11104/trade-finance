# Trade Finance Chaincode: Business Validation Review

This document provides an audit of the existing business validations in the Letter of Credit (LC) chaincode and a roadmap for elevating it to an enterprise-grade standard.

## 1. Current Business Validations
The current implementation focuses on basic state-machine transitions and MSP-based identity checks.

### State & Identity Matrix

| Function | Validation | Error Message |
| :--- | :--- | :--- |
| **General** | Argument length check | `[functionName] requires [N] arguments: ...` |
| **createLC** | Identity check | `"only Org1 Importer can create LC"` |
| | Duplicate ID check | `"LC already exists"` |
| | Amount format | `"invalid amount format"` |
| | Amount value | `"amount must be positive"` |
| **issueLC** | State check | `"LC must be in CREATED state to initiate issue"` |
| | Proposal existence | `"issue proposal already exists, waiting for Issuing Bank approval"` |
| | Sequence check | `"no issue proposal found, Importer must propose first"` |
| | Duplicate approval | `"issue already approved"` |
| | Role check | `"issueLC requires Importer (Org1) proposal and Issuing Bank (Org3) approval"` |
| **adviseLC** | Identity check | `"only Advising Bank can advise LC"` |
| | State check | `"LC must be ISSUED before advising"` |
| **confirmLC** | Identity check | `"only Advising/Confirming Bank can confirm LC"` |
| | State check | `"LC must be ADVISED before confirmation"` |
| **submitDocuments**| Identity check | `"only Exporter can submit documents"` |
| | State check | `"LC must be CONFIRMED before shipment"` |
| **verifyDocuments**| Identity check | `"only Issuing Bank can verify documents"` |
| | State check | `"LC must be SHIPPED before verification"` |
| **releasePayment** | State check | `"LC must be VERIFIED before payment release"` |
| | Proposal existence | `"payment proposal already exists, waiting for Issuing Bank approval"` |
| | Sequence check | `"no payment proposal found, Exporter must propose first"` |
| | Duplicate approval | `"payment already approved"` |
| | Role check | `"releasePayment requires Exporter (Org2) proposal and Issuing Bank (Org3) approval"` |
| **amendLC** | Identity check | `"amendments require Importer and Issuing Bank endorsement"` |
| | State check | `"cannot amend a completed or cancelled LC"` |
| **cancelLC** | Identity check | `"only Importer or Issuing Bank can cancel LC"` |
| | State check | `"cannot cancel a paid LC"` |

---

## 2. Enterprise-Grade Recommendations
To transition from a functional prototype to an enterprise-grade system, the following validations should be implemented. These focus on **data integrity**, **regulatory compliance**, and **risk mitigation**.

### A. Temporal & Date Validations
*Preventing transactions on expired instruments.*
- **Expiry Enforcement**: Block `submitDocuments` or `verifyDocuments` if `time.Now()` > `LC.Expiry`.
  - **Message**: `"Transaction rejected: The Letter of Credit expired on [Date]."`
- **Date Sanity**: Ensure `CreatedAt` and `Expiry` are not in the past/future inappropriately.
  - **Message**: `"Invalid date: [Field] cannot be in the future."`

### B. Financial & Currency Guardrails
*Ensuring financial precision and standardization.*
- **Currency Whitelisting**: Validate `Currency` against ISO 4217 (e.g., USD, EUR, GBP).
  - **Message**: `"Invalid currency: [Currency] is not a supported ISO 4217 currency code."`
- **Decimal Precision**: Enforce a maximum of 2 decimal places for the `Amount` to prevent float-rounding errors in settlements.
  - **Message**: `"Invalid amount precision: Amount exceeds maximum allowed decimal places (2)."`

### C. Dynamic Role Management
*Moving away from hardcoded MSPIDs to a Participant Registry.*
- **Ownership Verification**: Instead of checking `Org1MSP`, verify if the caller is the `Importer` assigned to that specific LC ID.
  - **Message**: `"Unauthorized: The current user is not the registered Importer for LC [ID]."`

### D. Document & Data Integrity
*Ensuring the "Paper Trail" is immutable and valid.*
- **Hash Format Validation**: Ensure `DocumentsHash` follows a specific cryptographic format (e.g., SHA-256) and is not empty.
  - **Message**: `"Document verification failed: Provided hash is invalid or empty for LC [ID]."`
- **Amendment Conflict Detection**: Block amendments that change critical terms (like `Amount` or `Expiry`) without a new multi-party approval flow.
  - **Message**: `"Amendment rejected: Changes to critical terms require explicit re-approval from the Issuing Bank."`

### E. State Machine Robustness
- **Terminal State Lock**: Implement a global check that blocks *all* writes once state is `PAID` or `CANCELLED`.
  - **Message**: `"Illegal operation: LC [ID] is in a terminal state ([Status]) and cannot be modified."`

### F. Compliance & Mandatory Fields
- **Field Completeness**: Enforce that `Terms` and `PaymentDetails` are not empty before moving to `ISSUED` or `PAID`.
  - **Message**: `"Compliance Error: [Field Name] is mandatory for this transition."`
