package financeapp_test

import (
	"testing"
	"time"

	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestCreateBorrowingRequest_Fields(t *testing.T) {
	accID := finance.AccountID("acc_123")
	req := &financeapp.CreateBorrowingRequest{
		Counterparty: "Alice",
		Direction:    string(finance.BorrowingDirectionLent),
		TotalAmount:  15000,
		Currency:     "USD",
		Notes:        "Dinner loan",
		AccountID:    &accID,
	}

	if req.Counterparty != "Alice" || req.Direction != string(finance.BorrowingDirectionLent) {
		t.Errorf("unexpected borrowing person or direction: %s / %s", req.Counterparty, req.Direction)
	}
	if req.TotalAmount != 15000 || req.AccountID == nil || *req.AccountID != "acc_123" {
		t.Errorf("unexpected target account or amount")
	}
}

func TestCreateBorrowingRepaymentRequest_Fields(t *testing.T) {
	accID := finance.AccountID("acc_456")
	now := time.Now().UTC()

	req := &financeapp.CreateBorrowingRepaymentRequest{
		BorrowingID: finance.BorrowingID("bor_999"),
		Amount:      5000,
		PaymentDate: now,
		Notes:       "Partial payment",
		AccountID:   accID,
	}

	if req.BorrowingID != "bor_999" || req.Amount != 5000 {
		t.Errorf("unexpected repayment parameters")
	}
	if req.AccountID != "acc_456" {
		t.Errorf("expected account ID acc_456")
	}
}
