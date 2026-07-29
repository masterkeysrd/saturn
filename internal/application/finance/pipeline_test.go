package financeapp_test

import (
	"testing"

	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
)

func TestIngestionRequest_Structure(t *testing.T) {
	req := &financeapp.IngestionRequest{
		TextContent: "Order confirmation for Uber trip",
		Documents: []financeapp.DocumentFile{
			{
				Filename:    "receipt.pdf",
				ContentType: "application/pdf",
				Content:     []byte("pdf-data-stream"),
			},
		},
		Metadata: map[string]any{
			"sender": "receipts@uber.com",
		},
	}

	if req.TextContent != "Order confirmation for Uber trip" {
		t.Errorf("unexpected text content: %s", req.TextContent)
	}
	if len(req.Documents) != 1 || req.Documents[0].Filename != "receipt.pdf" {
		t.Errorf("unexpected documents payload")
	}
}

func TestSignalSuggestion_Structure(t *testing.T) {
	accID := "acc_123"
	sug := &financeapp.SignalSuggestion{
		Classification: "RECEIPT",
		Vendor:         "Starbucks",
		Amount:         450,
		Currency:       "USD",
		Date:           "2026-07-28",
		AccountID:      &accID,
	}

	if sug.Vendor != "Starbucks" || sug.Amount != 450 {
		t.Errorf("unexpected suggestion values: vendor=%s amount=%d", sug.Vendor, sug.Amount)
	}
	if sug.AccountID == nil || *sug.AccountID != "acc_123" {
		t.Errorf("expected AccountID to be acc_123")
	}
}
