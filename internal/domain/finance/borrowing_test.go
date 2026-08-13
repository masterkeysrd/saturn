package finance

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

func TestBorrowingID(t *testing.T) {
	bID, err := NewBorrowingID()
	if err != nil {
		t.Fatalf("unexpected error creating borrowing ID: %v", err)
	}
	if err := bID.Validate(); err != nil {
		t.Errorf("expected valid borrowing ID, got: %v", err)
	}
	if bID.String() == "" {
		t.Error("expected non-empty string representation")
	}

	parsed, err := ParseBorrowingID(string(bID))
	if err != nil || parsed != bID {
		t.Errorf("failed to parse borrowing ID: %v", err)
	}

	mustID := MustBorrowingID(string(bID))
	if mustID != bID {
		t.Errorf("MustBorrowingID mismatch: got %v, want %v", mustID, bID)
	}
}

func TestBorrowing_Validate(t *testing.T) {
	bID, _ := NewBorrowingID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	accID, _ := NewAccountID()
	now := time.Now()

	tests := []struct {
		name      string
		borrowing Borrowing
		wantErr   bool
	}{
		{
			name: "valid borrowing lent",
			borrowing: Borrowing{
				ID:              bID,
				SpaceID:         spaceID,
				Direction:       BorrowingDirectionLent,
				Counterparty:    "John Doe",
				TotalAmount:     10000,
				RemainingAmount: 10000,
				Currency:        "USD",
				Status:          BorrowingStatusActive,
				EstablishedAt:   now,
				AccountID:       &accID,
			},
			wantErr: false,
		},
		{
			name: "valid borrowing borrowed paid off",
			borrowing: Borrowing{
				ID:              bID,
				SpaceID:         spaceID,
				Direction:       BorrowingDirectionBorrowed,
				Counterparty:    "Bank",
				TotalAmount:     50000,
				RemainingAmount: 0,
				Currency:        "USD",
				Status:          BorrowingStatusPaidOff,
				EstablishedAt:   now,
			},
			wantErr: false,
		},
		{
			name: "invalid direction",
			borrowing: Borrowing{
				ID:              bID,
				SpaceID:         spaceID,
				Direction:       "INVALID",
				Counterparty:    "John",
				TotalAmount:     10000,
				RemainingAmount: 10000,
				Currency:        "USD",
				Status:          BorrowingStatusActive,
				EstablishedAt:   now,
			},
			wantErr: true,
		},
		{
			name: "missing counterparty",
			borrowing: Borrowing{
				ID:              bID,
				SpaceID:         spaceID,
				Direction:       BorrowingDirectionLent,
				Counterparty:    "",
				TotalAmount:     10000,
				RemainingAmount: 10000,
				Currency:        "USD",
				Status:          BorrowingStatusActive,
				EstablishedAt:   now,
			},
			wantErr: true,
		},
		{
			name: "invalid remaining amount greater than total",
			borrowing: Borrowing{
				ID:              bID,
				SpaceID:         spaceID,
				Direction:       BorrowingDirectionLent,
				Counterparty:    "John",
				TotalAmount:     10000,
				RemainingAmount: 15000,
				Currency:        "USD",
				Status:          BorrowingStatusActive,
				EstablishedAt:   now,
			},
			wantErr: true,
		},
		{
			name: "negative remaining amount",
			borrowing: Borrowing{
				ID:              bID,
				SpaceID:         spaceID,
				Direction:       BorrowingDirectionLent,
				Counterparty:    "John",
				TotalAmount:     10000,
				RemainingAmount: -100,
				Currency:        "USD",
				Status:          BorrowingStatusActive,
				EstablishedAt:   now,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.borrowing.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Borrowing.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestBorrowingRepayment_Validate(t *testing.T) {
	bID, _ := NewBorrowingID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	repID, _ := NewBorrowingRepaymentID()
	now := time.Now()

	rep := BorrowingRepayment{
		ID:          repID,
		BorrowingID: bID,
		SpaceID:     spaceID,
		Amount:      3000,
		PaymentDate: now,
	}

	if err := rep.Validate(); err != nil {
		t.Errorf("unexpected error validating repayment: %v", err)
	}

	rep.Amount = 0
	if err := rep.Validate(); err == nil {
		t.Error("expected error for zero amount repayment, got nil")
	}
}

func TestBorrowing_ApplyPatch(t *testing.T) {
	bID, _ := NewBorrowingID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	now := time.Now().UTC()

	original := &Borrowing{
		ID:              bID,
		SpaceID:         spaceID,
		Direction:       BorrowingDirectionLent,
		Counterparty:    "Original Counterparty",
		ContactInfo:     "old@email.com",
		TotalAmount:     10000,
		RemainingAmount: 10000,
		Currency:        "USD",
		Status:          BorrowingStatusActive,
		EstablishedAt:   now,
		Notes:           "Original notes",
		Version:         1,
	}

	incoming := &Borrowing{
		Counterparty: "Updated Counterparty",
		Notes:        "Patched notes",
	}

	mask := []string{"counterparty", "notes"}
	if err := original.ApplyPatch(incoming, mask); err != nil {
		t.Fatalf("ApplyPatch failed: %v", err)
	}

	if original.Counterparty != "Updated Counterparty" {
		t.Errorf("Counterparty = %s, want Updated Counterparty", original.Counterparty)
	}
	if original.Notes != "Patched notes" {
		t.Errorf("Notes = %s, want Patched notes", original.Notes)
	}
	if original.ContactInfo != "old@email.com" {
		t.Errorf("ContactInfo = %s, want old@email.com (unmodified)", original.ContactInfo)
	}
}

func TestBorrowing_ApplyTransaction(t *testing.T) {
	bID, _ := NewBorrowingID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	now := time.Now().UTC()

	t.Run("Disbursement increases debt and total", func(t *testing.T) {
		b := &Borrowing{
			ID:              bID,
			SpaceID:         spaceID,
			Direction:       BorrowingDirectionLent,
			Counterparty:    "Alice",
			TotalAmount:     10000,
			RemainingAmount: 10000,
			Currency:        "USD",
			Status:          BorrowingStatusActive,
			EstablishedAt:   now,
		}

		role, tType, desc, err := b.ApplyTransaction(BorrowingTransactionTypeDisbursement, 5000)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if role != "DISBURSEMENT" {
			t.Errorf("role = %s, want DISBURSEMENT", role)
		}
		if tType != TransactionTypeExpense {
			t.Errorf("type = %s, want EXPENSE", tType)
		}
		if desc != "Additional loan to Alice" {
			t.Errorf("desc = %s, want Additional loan to Alice", desc)
		}
		if b.TotalAmount != 15000 || b.RemainingAmount != 15000 {
			t.Errorf("total = %d, remaining = %d, want 15000", b.TotalAmount, b.RemainingAmount)
		}
	})

	t.Run("AdjustBalance updates remaining amount, delta, and status", func(t *testing.T) {
		b := &Borrowing{
			ID:              bID,
			SpaceID:         spaceID,
			Direction:       BorrowingDirectionBorrowed,
			Counterparty:    "Bob",
			TotalAmount:     10000,
			RemainingAmount: 5000,
			Currency:        "USD",
			Status:          BorrowingStatusActive,
			EstablishedAt:   now,
		}

		delta := b.AdjustBalance(2000)
		if delta != -3000 {
			t.Errorf("delta = %d, want -3000", delta)
		}
		if b.RemainingAmount != 2000 {
			t.Errorf("remaining = %d, want 2000", b.RemainingAmount)
		}
		if b.Status != BorrowingStatusActive {
			t.Errorf("status = %s, want ACTIVE", b.Status)
		}

		delta = b.AdjustBalance(0)
		if delta != -2000 {
			t.Errorf("delta = %d, want -2000", delta)
		}
		if b.RemainingAmount != 0 {
			t.Errorf("remaining = %d, want 0", b.RemainingAmount)
		}
		if b.Status != BorrowingStatusPaidOff {
			t.Errorf("status = %s, want PAID_OFF", b.Status)
		}
	})

	t.Run("Payment reduces debt and updates status to PAID_OFF when remaining reaches 0", func(t *testing.T) {
		b := &Borrowing{
			ID:              bID,
			SpaceID:         spaceID,
			Direction:       BorrowingDirectionBorrowed,
			Counterparty:    "Bob",
			TotalAmount:     10000,
			RemainingAmount: 10000,
			Currency:        "USD",
			Status:          BorrowingStatusActive,
			EstablishedAt:   now,
		}

		role, tType, desc, err := b.ApplyTransaction(BorrowingTransactionTypePayment, 10000)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if role != "REPAYMENT" {
			t.Errorf("role = %s, want REPAYMENT", role)
		}
		if tType != TransactionTypeExpense {
			t.Errorf("type = %s, want EXPENSE", tType)
		}
		if desc != "Repayment to Bob" {
			t.Errorf("desc = %s, want Repayment to Bob", desc)
		}
		if b.RemainingAmount != 0 || b.Status != BorrowingStatusPaidOff {
			t.Errorf("remaining = %d, status = %s, want 0 and PAID_OFF", b.RemainingAmount, b.Status)
		}
	})
}

func TestBorrowing_NewTransaction(t *testing.T) {
	bID, _ := NewBorrowingID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	accID, _ := NewAccountID()
	now := time.Now().UTC()

	b := &Borrowing{
		ID:            bID,
		SpaceID:       spaceID,
		Direction:     BorrowingDirectionLent,
		Counterparty:  "Alice",
		Currency:      "USD",
		EstablishedAt: now,
	}

	txn, err := b.NewTransaction(BorrowingTransactionOpts{
		Role:                "REPAYMENT",
		Type:                TransactionTypeIncome,
		Amount:              2500,
		AmountInBase:        2500,
		AccountImpactAmount: 2500,
		AccountID:           &accID,
		TransactionDate:     now,
		Description:         "Repayment from Alice",
	})
	if err != nil {
		t.Fatalf("NewTransaction failed: %v", err)
	}

	if txn.SpaceID != spaceID {
		t.Errorf("SpaceID = %s, want %s", txn.SpaceID, spaceID)
	}
	if txn.Currency != "USD" {
		t.Errorf("Currency = %s, want USD", txn.Currency)
	}
	if *txn.Metadata.BorrowingID != bID {
		t.Errorf("BorrowingID = %s, want %s", *txn.Metadata.BorrowingID, bID)
	}
	if txn.Metadata.BorrowingRole != "REPAYMENT" {
		t.Errorf("BorrowingRole = %s, want REPAYMENT", txn.Metadata.BorrowingRole)
	}
}

func TestBorrowing_RollbackTransaction(t *testing.T) {
	bID, _ := NewBorrowingID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	now := time.Now().UTC()

	t.Run("Rollback REPAYMENT restores remaining balance and ACTIVE status", func(t *testing.T) {
		b := &Borrowing{
			ID:              bID,
			SpaceID:         spaceID,
			Direction:       BorrowingDirectionBorrowed,
			Counterparty:    "Charlie",
			TotalAmount:     10000,
			RemainingAmount: 5000,
			Currency:        "USD",
			Status:          BorrowingStatusPaidOff,
		}

		b.RollbackTransaction("REPAYMENT", TransactionTypeExpense, 3000)
		if b.RemainingAmount != 8000 {
			t.Errorf("remaining = %d, want 8000", b.RemainingAmount)
		}
		if b.Status != BorrowingStatusActive {
			t.Errorf("status = %s, want ACTIVE", b.Status)
		}
	})

	t.Run("Rollback DISBURSEMENT reduces total and remaining amount", func(t *testing.T) {
		b := &Borrowing{
			ID:              bID,
			SpaceID:         spaceID,
			Direction:       BorrowingDirectionLent,
			Counterparty:    "David",
			TotalAmount:     15000,
			RemainingAmount: 15000,
			Currency:        "USD",
			Status:          BorrowingStatusActive,
		}

		b.RollbackTransaction("DISBURSEMENT", TransactionTypeExpense, 5000)
		if b.TotalAmount != 10000 || b.RemainingAmount != 10000 {
			t.Errorf("total = %d, remaining = %d, want 10000", b.TotalAmount, b.RemainingAmount)
		}
	})

	t.Run("Rollback INITIAL_FUNDING sets remaining to 0 and status to PAID_OFF", func(t *testing.T) {
		b := &Borrowing{
			ID:              bID,
			SpaceID:         spaceID,
			Direction:       BorrowingDirectionBorrowed,
			Counterparty:    "Eve",
			TotalAmount:     10000,
			RemainingAmount: 10000,
			Currency:        "USD",
			Status:          BorrowingStatusActive,
			EstablishedAt:   now,
		}

		b.RollbackTransaction("INITIAL_FUNDING", TransactionTypeIncome, 10000)
		if b.RemainingAmount != 0 {
			t.Errorf("remaining = %d, want 0", b.RemainingAmount)
		}
		if b.Status != BorrowingStatusPaidOff {
			t.Errorf("status = %s, want PAID_OFF", b.Status)
		}
	})
}
