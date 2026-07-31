package financeapp_test

import (
	"testing"

	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestCreateAccountRequest_Validation(t *testing.T) {
	req := &financeapp.CreateAccountRequest{
		Name:           "Main Credit Card",
		Type:           string(finance.AccountTypeCreditCard),
		Currency:       "USD",
		InitialBalance: 0,
		CreditLimit:    500000,
		LastFour:       "4321",
	}

	if req.Name != "Main Credit Card" || req.Type != string(finance.AccountTypeCreditCard) {
		t.Errorf("unexpected account fields: %s / %s", req.Name, req.Type)
	}
	if req.LastFour != "4321" {
		t.Errorf("expected last four to be 4321")
	}
	if req.CreditLimit != 500000 {
		t.Errorf("expected credit limit to be 500000")
	}
}

func TestUpdateAccountRequest_Fields(t *testing.T) {
	req := &financeapp.UpdateAccountRequest{
		ID:             finance.AccountID("acc_123"),
		Name:           "Savings Account",
		Type:           string(finance.AccountTypeBank),
		Currency:       "USD",
		InitialBalance: 100000,
		IsActive:       true,
	}

	if req.ID != "acc_123" || req.Name != "Savings Account" || !req.IsActive {
		t.Errorf("unexpected update account request fields")
	}
}
