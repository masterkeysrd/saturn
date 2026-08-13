package finance

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

func TestAccountID(t *testing.T) {
	accID, err := NewAccountID()
	if err != nil {
		t.Fatalf("unexpected error creating account ID: %v", err)
	}
	if err := accID.Validate(); err != nil {
		t.Errorf("expected valid account ID, got: %v", err)
	}
	if accID.String() == "" {
		t.Error("expected non-empty string representation")
	}

	parsed, err := ParseAccountID(string(accID))
	if err != nil || parsed != accID {
		t.Errorf("failed to parse account ID: %v", err)
	}

	mustID := MustAccountID(string(accID))
	if mustID != accID {
		t.Errorf("MustAccountID mismatch: got %v, want %v", mustID, accID)
	}
}

func TestAccountID_Invalid(t *testing.T) {
	_, err := ParseAccountID("invalid_id")
	if err == nil {
		t.Error("expected error parsing invalid account ID, got nil")
	}

	defer func() {
		if r := recover(); r == nil {
			t.Error("expected MustAccountID to panic on invalid ID")
		}
	}()
	MustAccountID("invalid_id")
}

func TestAccount_Validate(t *testing.T) {
	accID, _ := NewAccountID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)

	tests := []struct {
		name    string
		account Account
		wantErr bool
	}{
		{
			name: "valid bank account",
			account: Account{
				ID:       accID,
				SpaceID:  spaceID,
				Name:     "Checking Account",
				Type:     AccountTypeBank,
				Currency: "USD",
			},
			wantErr: false,
		},
		{
			name: "valid credit card account with last four",
			account: Account{
				ID:          accID,
				SpaceID:     spaceID,
				Name:        "Visa Card",
				Type:        AccountTypeCreditCard,
				Currency:    "USD",
				CreditLimit: 500000,
				LastFour:    "4321",
			},
			wantErr: false,
		},
		{
			name: "missing name",
			account: Account{
				ID:       accID,
				SpaceID:  spaceID,
				Name:     "",
				Type:     AccountTypeBank,
				Currency: "USD",
			},
			wantErr: true,
		},
		{
			name: "invalid type",
			account: Account{
				ID:       accID,
				SpaceID:  spaceID,
				Name:     "Account",
				Type:     "INVALID_TYPE",
				Currency: "USD",
			},
			wantErr: true,
		},
		{
			name: "negative credit limit",
			account: Account{
				ID:          accID,
				SpaceID:     spaceID,
				Name:        "Credit Card",
				Type:        AccountTypeCreditCard,
				Currency:    "USD",
				CreditLimit: -100,
			},
			wantErr: true,
		},
		{
			name: "invalid last four - wrong length",
			account: Account{
				ID:       accID,
				SpaceID:  spaceID,
				Name:     "Card",
				Type:     AccountTypeBank,
				Currency: "USD",
				LastFour: "123",
			},
			wantErr: true,
		},
		{
			name: "invalid last four - non-digit characters",
			account: Account{
				ID:       accID,
				SpaceID:  spaceID,
				Name:     "Card",
				Type:     AccountTypeBank,
				Currency: "USD",
				LastFour: "12a4",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.account.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Account.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestAccount_SortFields(t *testing.T) {
	if !IsAccountSortField("name") {
		t.Error("expected 'name' to be valid sort field")
	}
	if !IsAccountSortField("current_balance") {
		t.Error("expected 'current_balance' to be valid sort field")
	}
	if IsAccountSortField("invalid") {
		t.Error("expected 'invalid' to be invalid sort field")
	}

	acc := &Account{Name: "Savings"}
	val := acc.GetSortValue("name")
	if val != "Savings" {
		t.Errorf("GetSortValue('name') = %q, want %q", val, "Savings")
	}
}

func TestAccount_ApplyAndRollbackTransaction(t *testing.T) {
	accID, _ := NewAccountID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)

	t.Run("Asset Bank Account: Expense decreases balance, Income increases balance", func(t *testing.T) {
		acc := &Account{
			ID:             accID,
			SpaceID:        spaceID,
			Name:           "Bank Account",
			Type:           AccountTypeBank,
			CurrentBalance: 10000,
		}

		acc.ApplyTransaction(TransactionTypeExpense, 2000)
		if acc.CurrentBalance != 8000 {
			t.Errorf("balance after expense = %d, want 8000", acc.CurrentBalance)
		}

		acc.RollbackTransaction(TransactionTypeExpense, 2000)
		if acc.CurrentBalance != 10000 {
			t.Errorf("balance after rollback = %d, want 10000", acc.CurrentBalance)
		}

		acc.ApplyTransaction(TransactionTypeIncome, 5000)
		if acc.CurrentBalance != 15000 {
			t.Errorf("balance after income = %d, want 15000", acc.CurrentBalance)
		}
	})

	t.Run("Liability Credit Card Account: Expense increases debt, Payment/Income decreases debt", func(t *testing.T) {
		acc := &Account{
			ID:             accID,
			SpaceID:        spaceID,
			Name:           "Credit Card",
			Type:           AccountTypeCreditCard,
			CurrentBalance: 1000,
		}

		acc.ApplyTransaction(TransactionTypeExpense, 500)
		if acc.CurrentBalance != 1500 {
			t.Errorf("credit balance after expense = %d, want 1500", acc.CurrentBalance)
		}

		acc.ApplyTransaction(TransactionTypeIncome, 700)
		if acc.CurrentBalance != 800 {
			t.Errorf("credit balance after payment/income = %d, want 800", acc.CurrentBalance)
		}
	})
}
