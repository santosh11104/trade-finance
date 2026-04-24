package main

import (
    "encoding/json"
    "fmt"
    "os"
    "time"

    "github.com/hyperledger/fabric-chaincode-go/shim"
    sc "github.com/hyperledger/fabric-protos-go/peer"
    cid "github.com/hyperledger/fabric-chaincode-go/pkg/cid"
)

type SmartContract struct{}

const (
    Org1MSP = "Org1MSP" // Importer
    Org2MSP = "Org2MSP" // Exporter
    Org3MSP = "Org3MSP" // Issuing Bank
    Org4MSP = "Org4MSP" // Advising Bank
)

func (s *SmartContract) Init(APIstub shim.ChaincodeStubInterface) sc.Response {
    return shim.Success(nil)
}

func (s *SmartContract) Invoke(APIstub shim.ChaincodeStubInterface) sc.Response {
    function, args := APIstub.GetFunctionAndParameters()

    if function == "createLC" {
        return s.createLC(APIstub, args)
    } else if function == "issueLC" {
        return s.issueLC(APIstub, args)
    } else if function == "adviseLC" {
        return s.adviseLC(APIstub, args)
    } else if function == "confirmLC" {
        return s.confirmLC(APIstub, args)
    } else if function == "submitDocuments" {
        return s.submitDocuments(APIstub, args)
    } else if function == "verifyDocuments" {
        return s.verifyDocuments(APIstub, args)
    } else if function == "releasePayment" {
        return s.releasePayment(APIstub, args)
    } else if function == "amendLC" {
        return s.amendLC(APIstub, args)
    } else if function == "cancelLC" {
        return s.cancelLC(APIstub, args)
    } else if function == "queryLC" {
        return s.queryLC(APIstub, args)
    } else if function == "getLCStatusHistory" {
        return s.getLCStatusHistory(APIstub, args)
    }

    return shim.Error("Invalid Smart Contract function name")
}

func (s *SmartContract) createLC(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    if len(args) < 10 {
        return shim.Error("Incorrect number of arguments. Expecting 10 (id, importer, exporter, issuingBank, advisingBank, amount, currency, expiry, terms, actor)")
    }

    if ok, err := assertMSP(APIstub, Org1MSP); err != nil || !ok {
        return shim.Error("only Importer can create LC")
    }

    lcID := args[0]
    existing, _ := APIstub.GetState(lcID)
    if existing != nil {
        return shim.Error(fmt.Sprintf("Validation Error: LC with ID [%s] already exists", lcID))
    }

    expiryDate, err := time.Parse(time.RFC3339, args[7])
    if err != nil {
        return shim.Error(fmt.Sprintf("Validation Error: Expiry date [%s] must be in ISO-8601 (RFC3339) format (e.g., 2026-05-20T15:04:05Z)", args[7]))
    }

    txTimestamp, err := APIstub.GetTxTimestamp()
    if err != nil {
        return shim.Error("Internal Error: Could not retrieve transaction timestamp")
    }
    now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC()

    minExpiry := now.AddDate(0, 0, 30)
    if expiryDate.Before(minExpiry) {
        return shim.Error(fmt.Sprintf("Validation Error: Expiry date [%s] must be at least 30 days in the future from now [%s]", args[7], now.Format(time.RFC3339)))
    }

    amount, err := parseAmount(args[5])
    if err != nil {
        return shim.Error(err.Error())
    }

    lc := LC{
        ID:           lcID,
        Importer:     args[1],
        Exporter:     args[2],
        IssuingBank:  args[3],
        AdvisingBank: args[4],
        Amount:       amount,
        Currency:     args[6],
        Expiry:       args[7],
        Terms:        args[8],
        Status:       "CREATED",
        CreatedAt:    now.Format(time.RFC3339),
        UpdatedAt:    now.Format(time.RFC3339),
        History:      []string{"CREATED"},
    }

    data, _ := json.Marshal(lc)
    if err := APIstub.PutState(lcID, data); err != nil {
        return shim.Error(err.Error())
    }

    s.emitEvent(APIstub, lcID, "CREATED", args[9])

    return shim.Success(data)
}

func (s *SmartContract) issueLC(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    if len(args) < 3 {
        return shim.Error("Incorrect number of arguments. Expecting 3 (id, pricingData, actor)")
    }
    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }

    if lc.Status != "CREATED" && lc.Status != "ISSUE_PENDING" {
        return shim.Error("LC status must be CREATED or ISSUE_PENDING")
    }

    txTimestamp, _ := APIstub.GetTxTimestamp()
    now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

    // Step 1: Importer or Bank proposes
    if lc.Status == "CREATED" {
        lc.Status = "ISSUE_PENDING"
        lc.IssueProposal = &ApprovalRecord{
            ProposedBy: args[2],
            Timestamp:  now,
            Data:       args[1],
        }
        lc.History = append(lc.History, "ISSUE_PENDING")
        lc.UpdatedAt = now
        if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
        return shim.Success([]byte("LC issue proposed, awaiting Issuing Bank approval"))
    }

    // Step 2: Issuing Bank approves (dual-endorsement logic)
    if ok, err := assertMSP(APIstub, Org3MSP); err != nil || !ok {
        return shim.Error("only Issuing Bank can approve LC issue")
    }
    lc.Status = "ISSUED"
    if lc.IssueProposal == nil {
        lc.IssueProposal = &ApprovalRecord{}
    }
    lc.IssueProposal.ApprovedBy = args[2]
    lc.History = append(lc.History, "ISSUED")
    lc.UpdatedAt = now
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }

    s.emitEvent(APIstub, lc.ID, "ISSUED", args[2])
    return shim.Success([]byte("LC issued with dual endorsement"))
}

func (s *SmartContract) adviseLC(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    if ok, err := assertMSP(APIstub, Org4MSP); err != nil || !ok {
        return shim.Error("only Advising Bank can advise LC")
    }
    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status != "ISSUED" {
        return shim.Error("LC must be ISSUED before advising")
    }

    txTimestamp, _ := APIstub.GetTxTimestamp()
    now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

    lc.Status = "ADVISED"
    lc.UpdatedAt = now
    lc.History = append(lc.History, "ADVISED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    return shim.Success(nil)
}

func (s *SmartContract) confirmLC(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    if ok, err := assertMSP(APIstub, Org4MSP); err != nil || !ok {
        return shim.Error("only Advising Bank can confirm LC")
    }
    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status != "ADVISED" {
        return shim.Error("LC must be ADVISED before confirming")
    }

    txTimestamp, _ := APIstub.GetTxTimestamp()
    now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

    lc.Status = "CONFIRMED"
    lc.UpdatedAt = now
    lc.History = append(lc.History, "CONFIRMED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    return shim.Success(nil)
}

func (s *SmartContract) submitDocuments(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    if len(args) < 2 {
        return shim.Error("submitDocuments requires 2 arguments: id, documentsHash")
    }

    // Validate SHA-256 Hash format
    hash := args[1]
    if !isValidSHA256(hash) {
        return shim.Error(fmt.Sprintf("Validation Error: Documents hash [%s] is invalid; expected a 64-character SHA-256 hex string", hash))
    }

    if ok, err := assertMSP(APIstub, Org2MSP); err != nil || !ok {
        return shim.Error("only Exporter can submit documents")
    }

    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status != "CONFIRMED" {
        return shim.Error(fmt.Sprintf("Protocol Error: LC status must be [CONFIRMED] to submit documents, current status is [%s]", lc.Status))
    }

    expiryDate, _ := time.Parse(time.RFC3339, lc.Expiry)
    txTimestamp, _ := APIstub.GetTxTimestamp()
    now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC()

    if now.After(expiryDate) {
        return shim.Error(fmt.Sprintf("Validation Error: LC has expired on [%s], current transaction time is [%s]", lc.Expiry, now.Format(time.RFC3339)))
    }

    lc.Status = "SHIPPED"
    lc.DocumentsHash = args[1]
    lc.UpdatedAt = now.Format(time.RFC3339)
    lc.History = append(lc.History, "SHIPPED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    return shim.Success(nil)
}

func (s *SmartContract) verifyDocuments(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    if ok, err := assertMSP(APIstub, Org3MSP); err != nil || !ok {
        return shim.Error("only Issuing Bank can verify documents")
    }
    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status != "SHIPPED" {
        return shim.Error("LC must be SHIPPED before verifying documents")
    }

    txTimestamp, _ := APIstub.GetTxTimestamp()
    now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

    lc.Status = "VERIFIED"
    lc.UpdatedAt = now
    lc.History = append(lc.History, "VERIFIED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    return shim.Success(nil)
}

func (s *SmartContract) releasePayment(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    if len(args) < 3 {
        return shim.Error("Incorrect number of arguments. Expecting 3 (id, paymentDetails, actor)")
    }
    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }

    if lc.Status != "VERIFIED" && lc.Status != "PAYMENT_PENDING" {
        return shim.Error("LC status must be VERIFIED or PAYMENT_PENDING")
    }

    txTimestamp, _ := APIstub.GetTxTimestamp()
    now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

    if lc.Status == "VERIFIED" {
        lc.Status = "PAYMENT_PENDING"
        lc.PaymentProposal = &ApprovalRecord{
            ProposedBy: args[2],
            Timestamp:  now,
            Data:       args[1],
        }
        lc.History = append(lc.History, "PAYMENT_PENDING")
        lc.UpdatedAt = now
        if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
        return shim.Success([]byte("Payment release proposed, awaiting bank approval"))
    }

    if ok, err := assertMSP(APIstub, Org3MSP); err != nil || !ok {
        return shim.Error("only Issuing Bank can finalize payment")
    }
    lc.Status = "PAID"
    if lc.PaymentProposal == nil {
        lc.PaymentProposal = &ApprovalRecord{}
    }
    lc.PaymentProposal.ApprovedBy = args[2]
    lc.History = append(lc.History, "PAID")
    lc.UpdatedAt = now
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }

    return shim.Success([]byte("Payment released successfully"))
}

func (s *SmartContract) amendLC(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    
    txTimestamp, _ := APIstub.GetTxTimestamp()
    now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

    lc.Terms = lc.Terms + " | Amendment: " + args[1]
    lc.UpdatedAt = now
    lc.History = append(lc.History, "AMENDED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    return shim.Success(nil)
}

func (s *SmartContract) cancelLC(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    
    txTimestamp, _ := APIstub.GetTxTimestamp()
    now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)

    lc.Status = "CANCELLED"
    lc.UpdatedAt = now
    lc.History = append(lc.History, "CANCELLED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    return shim.Success(nil)
}

func (s *SmartContract) queryLC(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    if len(args) != 1 {
        return shim.Error("Incorrect number of arguments. Expecting LC ID")
    }
    data, err := APIstub.GetState(args[0])
    if err != nil || data == nil {
        return shim.Error("LC not found")
    }
    return shim.Success(data)
}

func (s *SmartContract) getLCStatusHistory(APIstub shim.ChaincodeStubInterface, args []string) sc.Response {
    if len(args) != 1 {
        return shim.Error("Incorrect number of arguments. Expecting LC ID")
    }
    resultsIterator, err := APIstub.GetHistoryForKey(args[0])
    if err != nil {
        return shim.Error(err.Error())
    }
    defer resultsIterator.Close()

    var history []LCLog
    for resultsIterator.HasNext() {
        response, err := resultsIterator.Next()
        if err != nil {
            return shim.Error(err.Error())
        }
        var lc LC
        json.Unmarshal(response.Value, &lc)
        history = append(history, LCLog{
            Status:    string(lc.Status),
            Timestamp: time.Unix(response.Timestamp.Seconds, int64(response.Timestamp.Nanos)).UTC().Format(time.RFC3339),
        })
    }

    data, _ := json.Marshal(history)
    return shim.Success(data)
}

func (s *SmartContract) fetchLC(APIstub shim.ChaincodeStubInterface, id string) (LC, error) {
    data, err := APIstub.GetState(id)
    if err != nil || data == nil {
        return LC{}, fmt.Errorf("LC [%s] not found", id)
    }
    var lc LC
    json.Unmarshal(data, &lc)
    return lc, nil
}

func (s *SmartContract) persistLC(APIstub shim.ChaincodeStubInterface, lc LC) error {
    data, _ := json.Marshal(lc)
    return APIstub.PutState(lc.ID, data)
}

func (s *SmartContract) emitEvent(APIstub shim.ChaincodeStubInterface, lcID string, action string, actor string) {
    txTimestamp, _ := APIstub.GetTxTimestamp()
    now := time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)).UTC().Format(time.RFC3339)
    event := LCEvent{LCID: lcID, Action: action, Actor: actor, Time: now}
    data, _ := json.Marshal(event)
    APIstub.SetEvent("LCEvent", data)
}

func assertMSP(APIstub shim.ChaincodeStubInterface, expectedMSP string) (bool, error) {
    msp, err := cid.GetMSPID(APIstub)
    if err != nil {
        return false, err
    }
    if msp != expectedMSP {
        return false, nil
    }
    return true, nil
}

func parseAmount(raw string) (float64, error) {
    var amount float64
    _, err := fmt.Sscanf(raw, "%f", &amount)
    if err != nil {
        return 0, fmt.Errorf("invalid amount format")
    }
    if amount <= 0 {
        return 0, fmt.Errorf("amount must be positive")
    }
    return amount, nil
}

func isValidSHA256(hash string) bool {
    if len(hash) != 64 {
        return false
    }
    for _, r := range hash {
        if !((r >= '0' && r <= '9') || (r >= 'a' && r <= 'f') || (r >= 'A' && r <= 'F')) {
            return false
        }
    }
    return true
}

func main() {
    err := shim.Start(new(SmartContract))
    if err != nil {
        fmt.Printf("Error starting LC chaincode: %s\n", err)
        os.Exit(1)
    }
}
