package financeapp_test

import (
	"testing"
	"time"

	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
)

func TestCreateTransferRequest_Fields(t *testing.T) {
	now := time.Now().UTC()
	req := &financeapp.CreateTransferRequest{
		SourceAccountID:      "acc_source",
		DestinationAccountID: "acc_dest",
		SourceAmount:         10000,
		DestinationAmount:    10000,
		TransferDate:         now,
		Notes:                "Savings deposit",
	}

	if req.SourceAccountID != "acc_source" || req.DestinationAccountID != "acc_dest" {
		t.Errorf("unexpected transfer source/dest accounts")
	}
	if req.SourceAmount != 10000 || req.DestinationAmount != 10000 {
		t.Errorf("unexpected transfer amounts")
	}
}

func TestListTransfersRequest_Fields(t *testing.T) {
	req := &financeapp.ListTransfersRequest{
		Limit:     20,
		PageToken: "tok_1",
	}

	if req.Limit != 20 || req.PageToken != "tok_1" {
		t.Errorf("unexpected list transfers filter")
	}
}
