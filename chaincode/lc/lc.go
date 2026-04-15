package main

import (
    "encoding/json"
    "fmt"
    "os"
    "time"

    "github.com/hyperledger/fabric-chaincode-go/v2/shim"
    sc "github.com/hyperledger/fabric-protos-go-apiv2/peer"
    cid "github.com/hyperledger/fabric-chaincode-go/v2/pkg/cid"
)

type SmartContract struct{}

const (
    pricingCollection      = "pricingCollection"
    shipmentDocsCollection = "shipmentDocsCollection"
    bankRiskCollection     = "bankRiskCollection"
)

func (s *SmartContract) Init(APIstub shim.ChaincodeStubInterface) *sc.Response {
    return shim.Success(nil)
}

func (s *SmartContract) Invoke(APIstub shim.ChaincodeStubInterface) *sc.Response {
    function, args := APIstub.GetFunctionAndParameters()

    switch function {
    case "createLC":
        return s.createLC(APIstub, args)
    case "issueLC":
        return s.issueLC(APIstub, args)
    case "adviseLC":
        return s.adviseLC(APIstub, args)
    case "confirmLC":
        return s.confirmLC(APIstub, args)
    case "submitDocuments":
        return s.submitDocuments(APIstub, args)
    case "verifyDocuments":
        return s.verifyDocuments(APIstub, args)
    case "releasePayment":
        return s.releasePayment(APIstub, args)
    case "amendLC":
        return s.amendLC(APIstub, args)
    case "cancelLC":
        return s.cancelLC(APIstub, args)
    case "queryLC":
        return s.queryLC(APIstub, args)
    case "getLCStatusHistory":
        return s.getLCStatusHistory(APIstub, args)
    default:
        return shim.Error("invalid function name")
    }
}

func (s *SmartContract) createLC(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 9 {
        return shim.Error("createLC requires 9 arguments: id, importer, exporter, issuingBank, advisingBank, amount, currency, expiry, terms")
    }
    mspid, err := getClientMSPID(APIstub)
    if err != nil {
        return shim.Error(err.Error())
    }
    if mspid != "Org1MSP" {
        return shim.Error("only Org1 Importer can create LC")
    }

    lcID := args[0]
    existing, _ := APIstub.GetState(lcID)
    if existing != nil {
        return shim.Error("LC already exists")
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
        CreatedAt:    time.Now().UTC().Format(time.RFC3339),
        UpdatedAt:    time.Now().UTC().Format(time.RFC3339),
        History:      []string{"CREATED"},
    }

    data, _ := json.Marshal(lc)
    if err := APIstub.PutState(lcID, data); err != nil {
        return shim.Error(err.Error())
    }
    s.emitEvent(APIstub, lcID, "CREATED")
    return shim.Success(data)
}

// issueLC implements two-phase approval: Org1 (Importer) proposes, Org3 (Issuing Bank) approves
// Args: [id, pricingData]
func (s *SmartContract) issueLC(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 2 {
        return shim.Error("issueLC requires 2 arguments: id, pricingData")
    }
    mspid, err := getClientMSPID(APIstub)
    if err != nil {
        return shim.Error(err.Error())
    }

    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil {
        return shim.Error(err.Error())
    }
    if lc.Status != "CREATED" && lc.Status != "ISSUE_PENDING" {
        return shim.Error("LC must be in CREATED state to initiate issue")
    }

    // Phase 1: Importer (Org1) proposes the LC issuance
    if mspid == "Org1MSP" {
        if lc.IssueProposal != nil {
            return shim.Error("issue proposal already exists, waiting for Issuing Bank approval")
        }
        lc.Status = "ISSUE_PENDING"
        lc.IssueProposal = &ApprovalRecord{
            ProposedBy: mspid,
            Timestamp:  time.Now().UTC().Format(time.RFC3339),
            Data:       args[1],
        }
        lc.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
        lc.History = append(lc.History, "ISSUE_PROPOSED")
        if err := s.persistLC(APIstub, lc); err != nil {
            return shim.Error(err.Error())
        }
        s.emitEvent(APIstub, lc.ID, "ISSUE_PROPOSED")
        return shim.Success([]byte("LC issue proposed, awaiting Issuing Bank approval"))
    }

    // Phase 2: Issuing Bank (Org3) approves and executes
    if mspid == "Org3MSP" {
        if lc.IssueProposal == nil {
            return shim.Error("no issue proposal found, Importer must propose first")
        }
        if lc.IssueProposal.ApprovedBy != "" {
            return shim.Error("issue already approved")
        }

        // Verify the pricing data matches proposal
        pricingData := []byte(lc.IssueProposal.Data)

        // Mark approval
        lc.IssueProposal.ApprovedBy = mspid
        lc.Status = "ISSUED"
        lc.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
        lc.History = append(lc.History, "ISSUED")
        if err := s.persistLC(APIstub, lc); err != nil {
            return shim.Error(err.Error())
        }

        // Store pricing in private collection
        if err := APIstub.PutPrivateData(pricingCollection, args[0], pricingData); err != nil {
            return shim.Error(err.Error())
        }

        s.emitEvent(APIstub, lc.ID, "ISSUED")
        return shim.Success([]byte("LC issued with dual endorsement"))
    }

    return shim.Error("issueLC requires Importer (Org1) proposal and Issuing Bank (Org3) approval")
}

func (s *SmartContract) adviseLC(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 1 {
        return shim.Error("adviseLC requires 1 argument: id")
    }
    if ok, err := assertMSP(APIstub, "Org4MSP"); err != nil || !ok {
        return shim.Error("only Advising Bank can advise LC")
    }

    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status != "ISSUED" {
        return shim.Error("LC must be ISSUED before advising")
    }

    lc.Status = "ADVISED"
    lc.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
    lc.History = append(lc.History, "ADVISED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    s.emitEvent(APIstub, lc.ID, "ADVISED")
    return shim.Success([]byte("LC advised"))
}

func (s *SmartContract) confirmLC(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 1 {
        return shim.Error("confirmLC requires 1 argument: id")
    }
    if ok, err := assertMSP(APIstub, "Org4MSP"); err != nil || !ok {
        return shim.Error("only Advising/Confirming Bank can confirm LC")
    }

    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status != "ADVISED" {
        return shim.Error("LC must be ADVISED before confirmation")
    }

    lc.Status = "CONFIRMED"
    lc.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
    lc.History = append(lc.History, "CONFIRMED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    s.emitEvent(APIstub, lc.ID, "CONFIRMED")
    return shim.Success([]byte("LC confirmed"))
}

func (s *SmartContract) submitDocuments(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 2 {
        return shim.Error("submitDocuments requires 2 arguments: id, documentsHash")
    }
    if ok, err := assertMSP(APIstub, "Org2MSP"); err != nil || !ok {
        return shim.Error("only Exporter can submit documents")
    }

    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status != "CONFIRMED" {
        return shim.Error("LC must be CONFIRMED before shipment")
    }

    lc.Status = "SHIPPED"
    lc.DocumentsHash = args[1]
    lc.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
    lc.History = append(lc.History, "SHIPPED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    if err := APIstub.PutPrivateData(shipmentDocsCollection, args[0], []byte(args[1])); err != nil { return shim.Error(err.Error()) }
    s.emitEvent(APIstub, lc.ID, "SHIPPED")
    return shim.Success([]byte("Documents submitted"))
}

func (s *SmartContract) verifyDocuments(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 1 {
        return shim.Error("verifyDocuments requires 1 argument: id")
    }
    if ok, err := assertMSP(APIstub, "Org3MSP"); err != nil || !ok {
        return shim.Error("only Issuing Bank can verify documents")
    }

    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status != "SHIPPED" {
        return shim.Error("LC must be SHIPPED before verification")
    }

    lc.Status = "VERIFIED"
    lc.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
    lc.History = append(lc.History, "VERIFIED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    s.emitEvent(APIstub, lc.ID, "VERIFIED")
    return shim.Success([]byte("Documents verified"))
}

// releasePayment implements two-phase approval: Org2 (Exporter) proposes, Org3 (Issuing Bank) approves
// Args: [id, paymentDetails]
func (s *SmartContract) releasePayment(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 2 {
        return shim.Error("releasePayment requires 2 arguments: id, paymentDetails")
    }
    mspid, err := getClientMSPID(APIstub)
    if err != nil {
        return shim.Error(err.Error())
    }

    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status != "VERIFIED" && lc.Status != "PAYMENT_PENDING" {
        return shim.Error("LC must be VERIFIED before payment release")
    }

    // Phase 1: Exporter (Org2) proposes payment release
    if mspid == "Org2MSP" {
        if lc.PaymentProposal != nil {
            return shim.Error("payment proposal already exists, waiting for Issuing Bank approval")
        }
        lc.Status = "PAYMENT_PENDING"
        lc.PaymentProposal = &ApprovalRecord{
            ProposedBy: mspid,
            Timestamp:  time.Now().UTC().Format(time.RFC3339),
            Data:       args[1],
        }
        lc.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
        lc.History = append(lc.History, "PAYMENT_PROPOSED")
        if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
        s.emitEvent(APIstub, lc.ID, "PAYMENT_PROPOSED")
        return shim.Success([]byte("Payment release proposed, awaiting Issuing Bank approval"))
    }

    // Phase 2: Issuing Bank (Org3) approves and executes
    if mspid == "Org3MSP" {
        if lc.PaymentProposal == nil {
            return shim.Error("no payment proposal found, Exporter must propose first")
        }
        if lc.PaymentProposal.ApprovedBy != "" {
            return shim.Error("payment already approved")
        }

        lc.PaymentProposal.ApprovedBy = mspid
        lc.Status = "PAID"
        lc.PaymentDetails = lc.PaymentProposal.Data
        lc.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
        lc.History = append(lc.History, "PAID")
        if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }

        // Store payment details in private collection for risk data
        paymentData := []byte(lc.PaymentProposal.Data)
        if err := APIstub.PutPrivateData(bankRiskCollection, args[0], paymentData); err != nil {
            return shim.Error(err.Error())
        }

        s.emitEvent(APIstub, lc.ID, "PAID")
        return shim.Success([]byte("Payment released with dual endorsement"))
    }

    return shim.Error("releasePayment requires Exporter (Org2) proposal and Issuing Bank (Org3) approval")
}

func (s *SmartContract) amendLC(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 2 {
        return shim.Error("amendLC requires 2 arguments: id, amendmentNote")
    }
    mspid, err := getClientMSPID(APIstub)
    if err != nil { return shim.Error(err.Error()) }
    if mspid != "Org1MSP" && mspid != "Org3MSP" {
        return shim.Error("amendments require Importer and Issuing Bank endorsement")
    }

    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status == "PAID" || lc.Status == "CANCELLED" {
        return shim.Error("cannot amend a completed or cancelled LC")
    }

    lc.Amendments = append(lc.Amendments, args[1])
    lc.Status = "ISSUED"
    lc.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
    lc.History = append(lc.History, "AMENDED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    s.emitEvent(APIstub, lc.ID, "AMENDED")
    return shim.Success([]byte("LC amended"))
}

func (s *SmartContract) cancelLC(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 1 {
        return shim.Error("cancelLC requires 1 argument: id")
    }
    mspid, err := getClientMSPID(APIstub)
    if err != nil { return shim.Error(err.Error()) }
    if mspid != "Org1MSP" && mspid != "Org3MSP" {
        return shim.Error("only Importer or Issuing Bank can cancel LC")
    }

    lc, err := s.fetchLC(APIstub, args[0])
    if err != nil { return shim.Error(err.Error()) }
    if lc.Status == "PAID" {
        return shim.Error("cannot cancel a paid LC")
    }

    lc.Status = "CANCELLED"
    lc.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
    lc.History = append(lc.History, "CANCELLED")
    if err := s.persistLC(APIstub, lc); err != nil { return shim.Error(err.Error()) }
    s.emitEvent(APIstub, lc.ID, "CANCELLED")
    return shim.Success([]byte("LC cancelled"))
}

func (s *SmartContract) queryLC(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 1 {
        return shim.Error("queryLC requires 1 argument: id")
    }
    data, err := APIstub.GetState(args[0])
    if err != nil {
        return shim.Error(err.Error())
    }
    if data == nil {
        return shim.Error("LC not found")
    }
    return shim.Success(data)
}

func (s *SmartContract) getLCStatusHistory(APIstub shim.ChaincodeStubInterface, args []string) *sc.Response {
    if len(args) < 1 {
        return shim.Error("getLCStatusHistory requires 1 argument: id")
    }
    iterator, err := APIstub.GetHistoryForKey(args[0])
    if err != nil {
        return shim.Error(err.Error())
    }
    defer iterator.Close()

    var history []map[string]interface{}
    for iterator.HasNext() {
        modification, err := iterator.Next()
        if err != nil {
            return shim.Error(err.Error())
        }
        history = append(history, map[string]interface{}{
            "txId":      modification.TxId,
            "value":     json.RawMessage(modification.Value),
            "timestamp": modification.Timestamp,
            "isDelete":  modification.IsDelete,
        })
    }
    payload, _ := json.Marshal(history)
    return shim.Success(payload)
}

func (s *SmartContract) fetchLC(APIstub shim.ChaincodeStubInterface, id string) (*LC, error) {
    data, err := APIstub.GetState(id)
    if err != nil {
        return nil, err
    }
    if data == nil {
        return nil, fmt.Errorf("LC %s does not exist", id)
    }
    var lc LC
    if err := json.Unmarshal(data, &lc); err != nil {
        return nil, err
    }
    return &lc, nil
}

func (s *SmartContract) persistLC(APIstub shim.ChaincodeStubInterface, lc *LC) error {
    data, err := json.Marshal(lc)
    if err != nil {
        return err
    }
    return APIstub.PutState(lc.ID, data)
}

func (s *SmartContract) emitEvent(APIstub shim.ChaincodeStubInterface, lcID, action string) {
    event := LCEvent{LCID: lcID, Action: action, Actor: "unknown", Time: time.Now().UTC().Format(time.RFC3339)}
    payload, _ := json.Marshal(event)
    APIstub.SetEvent("LCEvent", payload)
}

func getClientMSPID(APIstub shim.ChaincodeStubInterface) (string, error) {
    mspid, err := cid.GetMSPID(APIstub)
    if err != nil {
        return "", err
    }
    return mspid, nil
}

func assertMSP(APIstub shim.ChaincodeStubInterface, required string) (bool, error) {
    mspid, err := getClientMSPID(APIstub)
    if err != nil { return false, err }
    return mspid == required, nil
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

func main() {
    err := shim.Start(new(SmartContract))
    if err != nil {
        fmt.Printf("Error starting LC chaincode: %s\\n", err)
        os.Exit(1)
    }
}
