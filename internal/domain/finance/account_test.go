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

func TestAccount_ReconcileLifecycleAndTransfer(t *testing.T) {
	accID1, _ := NewAccountID()
	accID2, _ := NewAccountID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)

	acc1 := &Account{
		ID:             accID1,
		SpaceID:        spaceID,
		Name:           "Checking",
		Type:           AccountTypeBank,
		Currency:       "USD",
		CurrentBalance: 5000,
		IsActive:       true,
		IsDefault:      false,
	}

	acc2 := &Account{
		ID:             accID2,
		SpaceID:        spaceID,
		Name:           "Savings",
		Type:           AccountTypeBank,
		Currency:       "USD",
		CurrentBalance: 2000,
		IsActive:       true,
		IsDefault:      false,
	}

	t.Run("ReconcileBalance builds adjustment transaction", func(t *testing.T) {
		txn, err := acc1.ReconcileBalance(ReconcileAccountOpts{
			TargetBalance: 6500,
			Note:          "Monthly Audit",
		})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if txn == nil {
			t.Fatal("expected non-nil transaction")
		}
		if txn.Amount != 1500 {
			t.Errorf("txn.Amount = %d, want 1500", txn.Amount)
		}
		if txn.Type != TransactionTypeBalanceAdjustment {
			t.Errorf("txn.Type = %s, want %s", txn.Type, TransactionTypeBalanceAdjustment)
		}
	})

	t.Run("Lifecycle: SetAsDefault & Deactivate rules", func(t *testing.T) {
		if err := acc1.SetAsDefault(); err != nil {
			t.Errorf("unexpected error setting default: %v", err)
		}
		if !acc1.IsDefault {
			t.Error("expected IsDefault = true")
		}

		if err := acc1.Deactivate(); err == nil {
			t.Error("expected error when deactivating default account")
		}

		acc1.IsDefault = false
		if err := acc1.Deactivate(); err != nil {
			t.Errorf("unexpected error deactivating non-default account: %v", err)
		}

		if err := acc1.SetAsDefault(); err == nil {
			t.Error("expected error setting inactive account as default")
		}

		acc1.Activate()
		if !acc1.IsActive {
			t.Error("expected IsActive = true after Activate()")
		}
	})

	t.Run("ValidateTransferTo rules", func(t *testing.T) {
		if err := acc1.ValidateTransferTo(acc2, 1000); err != nil {
			t.Errorf("unexpected error for valid transfer: %v", err)
		}

		if err := acc1.ValidateTransferTo(acc1, 1000); err == nil {
			t.Error("expected error when transfer source equals destination")
		}

		if err := acc1.ValidateTransferTo(acc2, 0); err == nil {
			t.Error("expected error when transfer amount is 0")
		}
	})
}

func TestAccount_Init(t *testing.T) {
	tests := []struct {
		name       string
		initialID  AccountID
		expectDiff bool
	}{
		{
			name:       "generates new ID when empty",
			initialID:  "",
			expectDiff: true,
		},
		{
			name:       "preserves existing ID when present",
			initialID:  AccountID("acc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO"),
			expectDiff: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acc := &Account{ID: tt.initialID}
			err := acc.Init()
			if err != nil {
				t.Fatalf("unexpected error during Init: %v", err)
			}
			if !acc.IsActive {
				t.Errorf("expected IsActive to be true")
			}
			if acc.CreateTime.IsZero() || acc.UpdateTime.IsZero() {
				t.Errorf("expected timestamps to be set")
			}
			if tt.expectDiff && acc.ID == tt.initialID {
				t.Errorf("expected ID to be generated, got empty")
			}
			if !tt.expectDiff && acc.ID != tt.initialID {
				t.Errorf("expected ID to be preserved, got %v", acc.ID)
			}
		})
	}
}

func TestAccount_ApplyPatch(t *testing.T) {
	accID, _ := NewAccountID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	instID := InstitutionID("inst_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	tests := []struct {
		name     string
		initial  Account
		incoming Account
		mask     []string
		verify   func(t *testing.T, acc *Account)
	}{
		{
			name: "patch name and credit limit",
			initial: Account{
				ID:          accID,
				SpaceID:     spaceID,
				Type:        AccountTypeCreditCard,
				Currency:    "USD",
				Name:        "Old Name",
				CreditLimit: 1000,
			},
			incoming: Account{Name: "New Name", CreditLimit: 5000},
			mask:     []string{"name", "credit_limit"},
			verify: func(t *testing.T, acc *Account) {
				if acc.Name != "New Name" || acc.CreditLimit != 5000 {
					t.Errorf("expected updated name and credit limit, got name=%s limit=%d", acc.Name, acc.CreditLimit)
				}
			},
		},
		{
			name: "patch color, notes, last_four, and institution_id",
			initial: Account{
				ID:       accID,
				SpaceID:  spaceID,
				Type:     AccountTypeBank,
				Currency: "USD",
				Name:     "Main Checking",
				Color:    "#000",
				Notes:    "Old",
				LastFour: "1111",
			},
			incoming: Account{
				Color:         "#fff",
				Notes:         "New",
				LastFour:      "4321",
				InstitutionID: &instID,
			},
			mask: []string{"color", "notes", "last_four", "institution_id"},
			verify: func(t *testing.T, acc *Account) {
				if acc.Color != "#fff" || acc.Notes != "New" || acc.LastFour != "4321" {
					t.Errorf("field mismatch: %+v", acc)
				}
				if acc.InstitutionID == nil || *acc.InstitutionID != instID {
					t.Errorf("institution ID mismatch: %+v", acc.InstitutionID)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acc := tt.initial
			err := acc.ApplyPatch(&tt.incoming, tt.mask)
			if err != nil {
				t.Fatalf("unexpected patch error: %v", err)
			}
			tt.verify(t, &acc)
		})
	}
}

func TestAccount_RollbackTransaction_Table(t *testing.T) {
	tests := []struct {
		name         string
		accountType  AccountType
		initBalance  int64
		txnType      TransactionType
		impactAmount int64
		wantBalance  int64
	}{
		{
			name:         "Bank: rollback Expense adds back balance",
			accountType:  AccountTypeBank,
			initBalance:  8000,
			txnType:      TransactionTypeExpense,
			impactAmount: 2000,
			wantBalance:  10000,
		},
		{
			name:         "Bank: rollback TransferOut adds back balance",
			accountType:  AccountTypeBank,
			initBalance:  5000,
			txnType:      TransactionTypeTransferOut,
			impactAmount: 1500,
			wantBalance:  6500,
		},
		{
			name:         "Bank: rollback Income subtracts balance",
			accountType:  AccountTypeBank,
			initBalance:  12000,
			txnType:      TransactionTypeIncome,
			impactAmount: 3000,
			wantBalance:  9000,
		},
		{
			name:         "Bank: rollback TransferIn subtracts balance",
			accountType:  AccountTypeBank,
			initBalance:  7000,
			txnType:      TransactionTypeTransferIn,
			impactAmount: 2000,
			wantBalance:  5000,
		},
		{
			name:         "Credit Card: rollback Expense subtracts debt",
			accountType:  AccountTypeCreditCard,
			initBalance:  1500,
			txnType:      TransactionTypeExpense,
			impactAmount: 500,
			wantBalance:  1000,
		},
		{
			name:         "Credit Card: rollback TransferOut subtracts debt",
			accountType:  AccountTypeCreditCard,
			initBalance:  2000,
			txnType:      TransactionTypeTransferOut,
			impactAmount: 600,
			wantBalance:  1400,
		},
		{
			name:         "Credit Card: rollback Income adds debt",
			accountType:  AccountTypeCreditCard,
			initBalance:  800,
			txnType:      TransactionTypeIncome,
			impactAmount: 700,
			wantBalance:  1500,
		},
		{
			name:         "Credit Card: rollback TransferIn adds debt",
			accountType:  AccountTypeCreditCard,
			initBalance:  500,
			txnType:      TransactionTypeTransferIn,
			impactAmount: 400,
			wantBalance:  900,
		},
		{
			name:         "Balance Adjustment rollback subtracts impact",
			accountType:  AccountTypeBank,
			initBalance:  10000,
			txnType:      TransactionTypeBalanceAdjustment,
			impactAmount: 2500,
			wantBalance:  7500,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acc := &Account{
				Type:           tt.accountType,
				CurrentBalance: tt.initBalance,
			}
			acc.RollbackTransaction(tt.txnType, tt.impactAmount)
			if acc.CurrentBalance != tt.wantBalance {
				t.Errorf("CurrentBalance = %d, want %d", acc.CurrentBalance, tt.wantBalance)
			}
		})
	}
}

func TestAccount_ValidateTransferTo_Table(t *testing.T) {
	rawSpace1, _ := id.Generate("spc_")
	rawSpace2, _ := id.Generate("spc_")
	space1 := SpaceID(rawSpace1)
	space2 := SpaceID(rawSpace2)
	id1, _ := NewAccountID()
	id2, _ := NewAccountID()

	tests := []struct {
		name    string
		source  Account
		dest    *Account
		amount  int64
		wantErr bool
	}{
		{
			name:    "nil destination account",
			source:  Account{ID: id1, SpaceID: space1, IsActive: true},
			dest:    nil,
			amount:  1000,
			wantErr: true,
		},
		{
			name:    "same source and destination ID",
			source:  Account{ID: id1, SpaceID: space1, IsActive: true},
			dest:    &Account{ID: id1, SpaceID: space1, IsActive: true},
			amount:  1000,
			wantErr: true,
		},
		{
			name:    "different spaces",
			source:  Account{ID: id1, SpaceID: space1, IsActive: true},
			dest:    &Account{ID: id2, SpaceID: space2, IsActive: true},
			amount:  1000,
			wantErr: true,
		},
		{
			name:    "source account inactive",
			source:  Account{ID: id1, SpaceID: space1, IsActive: false},
			dest:    &Account{ID: id2, SpaceID: space1, IsActive: true},
			amount:  1000,
			wantErr: true,
		},
		{
			name:    "destination account inactive",
			source:  Account{ID: id1, SpaceID: space1, IsActive: true},
			dest:    &Account{ID: id2, SpaceID: space1, IsActive: false},
			amount:  1000,
			wantErr: true,
		},
		{
			name:    "amount zero",
			source:  Account{ID: id1, SpaceID: space1, IsActive: true},
			dest:    &Account{ID: id2, SpaceID: space1, IsActive: true},
			amount:  0,
			wantErr: true,
		},
		{
			name:    "amount negative",
			source:  Account{ID: id1, SpaceID: space1, IsActive: true},
			dest:    &Account{ID: id2, SpaceID: space1, IsActive: true},
			amount:  -500,
			wantErr: true,
		},
		{
			name:    "valid transfer",
			source:  Account{ID: id1, SpaceID: space1, IsActive: true},
			dest:    &Account{ID: id2, SpaceID: space1, IsActive: true},
			amount:  5000,
			wantErr: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.source.ValidateTransferTo(tt.dest, tt.amount)
			if (err != nil) != tt.wantErr {
				t.Errorf("ValidateTransferTo() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestAccount_GetSortValue_Table(t *testing.T) {
	acc := &Account{
		Name:           "Treasury",
		CurrentBalance: 1234500,
	}
	_ = acc.Init()

	tests := []struct {
		name      string
		field     string
		wantExact string
	}{
		{
			name:      "name field",
			field:     "name",
			wantExact: "Treasury",
		},
		{
			name:      "current_balance field padded",
			field:     "current_balance",
			wantExact: "000000000001234500",
		},
		{
			name:      "fallback unknown field to name",
			field:     "unknown_sort_field",
			wantExact: "Treasury",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			val := acc.GetSortValue(tt.field)
			if val != tt.wantExact {
				t.Errorf("GetSortValue(%q) = %q, want %q", tt.field, val, tt.wantExact)
			}
		})
	}
}
