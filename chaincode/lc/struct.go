package main

type LCStatus string

type LC struct {
	ID             string            `json:"id"`
	Importer       string            `json:"importer"`
	Exporter       string            `json:"exporter"`
	IssuingBank    string            `json:"issuingBank"`
	AdvisingBank   string            `json:"advisingBank"`
	Amount         float64           `json:"amount"`
	Currency       string            `json:"currency"`
	Expiry         string            `json:"expiry"`
	Terms          string            `json:"terms"`
	Status         LCStatus          `json:"status"`
	DocumentsHash  string            `json:"documentsHash,omitempty"`
	PaymentDetails string            `json:"paymentDetails,omitempty"`
	Amendments     []string          `json:"amendments,omitempty"`
	History        []string          `json:"history,omitempty"`
	CreatedAt      string            `json:"createdAt"`
	UpdatedAt      string            `json:"updatedAt"`
	// Two-phase approval tracking for multi-party operations
	IssueProposal  *ApprovalRecord   `json:"issueProposal,omitempty"`
	PaymentProposal *ApprovalRecord  `json:"paymentProposal,omitempty"`
}

type ApprovalRecord struct {
	ProposedBy string `json:"proposedBy"`
	ApprovedBy string `json:"approvedBy,omitempty"`
	Timestamp  string `json:"timestamp"`
	Data       string `json:"data,omitempty"`
}

type LCEvent struct {
	LCID   string `json:"lcId"`
	Action string `json:"action"`
	Actor  string `json:"actor"`
	Time   string `json:"time"`
}
