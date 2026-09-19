package finance

import (
	"testing"
	"time"

	"github.com/segmentio/ksuid"
)

func TestParseInboxItemDocType(t *testing.T) {
	tests := []struct {
		input string
		want  InboxItemDocType
	}{
		{"INVOICE", InboxItemDocInvoice},
		{"invoice", InboxItemDocInvoice},
		{"RECEIPT", InboxItemDocReceipt},
		{"bank_notification", InboxItemDocBankNotification},
		{"SYSTEM_VERIFICATION", InboxItemDocSystemVerification},
		{"unknown_type", InboxItemDocUnknown},
		{"", InboxItemDocUnknown},
	}

	for _, tt := range tests {
		got := ParseInboxItemDocType(tt.input)
		if got != tt.want {
			t.Errorf("ParseInboxItemDocType(%q) = %v, want %v", tt.input, got, tt.want)
		}
	}
}

func TestInboxItem_MetadataHelpers(t *testing.T) {
	t.Run("MetadataBool", func(t *testing.T) {
		tests := []struct {
			name     string
			item     *InboxItem
			key      string
			wantBool bool
		}{
			{
				name:     "nil item",
				item:     nil,
				key:      "overwrite",
				wantBool: false,
			},
			{
				name:     "nil metadata map",
				item:     &InboxItem{Metadata: nil},
				key:      "overwrite",
				wantBool: false,
			},
			{
				name:     "key present and true",
				item:     &InboxItem{Metadata: map[string]any{"overwrite": true}},
				key:      "overwrite",
				wantBool: true,
			},
			{
				name:     "key present and false",
				item:     &InboxItem{Metadata: map[string]any{"overwrite": false}},
				key:      "overwrite",
				wantBool: false,
			},
			{
				name:     "key missing",
				item:     &InboxItem{Metadata: map[string]any{"other": true}},
				key:      "overwrite",
				wantBool: false,
			},
			{
				name:     "type mismatch non-bool",
				item:     &InboxItem{Metadata: map[string]any{"overwrite": "true"}},
				key:      "overwrite",
				wantBool: false,
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				got := tt.item.MetadataBool(tt.key)
				if got != tt.wantBool {
					t.Errorf("MetadataBool(%q) = %v, want %v", tt.key, got, tt.wantBool)
				}
			})
		}
	})

	t.Run("MetadataString", func(t *testing.T) {
		tests := []struct {
			name       string
			item       *InboxItem
			key        string
			wantString string
		}{
			{
				name:       "nil item",
				item:       nil,
				key:        "txn_type",
				wantString: "",
			},
			{
				name:       "key present string",
				item:       &InboxItem{Metadata: map[string]any{"txn_type": "TRANSFER"}},
				key:        "txn_type",
				wantString: "TRANSFER",
			},
			{
				name:       "key missing",
				item:       &InboxItem{Metadata: map[string]any{}},
				key:        "txn_type",
				wantString: "",
			},
			{
				name:       "type mismatch non-string",
				item:       &InboxItem{Metadata: map[string]any{"txn_type": 12345}},
				key:        "txn_type",
				wantString: "",
			},
		}

		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				got := tt.item.MetadataString(tt.key)
				if got != tt.wantString {
					t.Errorf("MetadataString(%q) = %q, want %q", tt.key, got, tt.wantString)
				}
			})
		}
	})
}

func TestInboxItem_SortFields(t *testing.T) {
	now := time.Now().UTC()
	item := &InboxItem{
		ID:              "ibx_123",
		Amount:          4500,
		VendorName:      "Acme Corp",
		TransactionDate: now,
		CreateTime:      now,
	}

	tests := []struct {
		field   string
		isValid bool
	}{
		{"create_time", true},
		{"amount", true},
		{"vendor_name", true},
		{"transaction_date", true},
		{"invalid_field", false},
	}

	for _, tt := range tests {
		t.Run(tt.field, func(t *testing.T) {
			if got := IsInboxItemSortField(tt.field); got != tt.isValid {
				t.Errorf("IsInboxItemSortField(%q) = %v, want %v", tt.field, got, tt.isValid)
			}
			sortVal := item.GetSortValue(tt.field)
			if tt.isValid && sortVal == "" {
				t.Errorf("GetSortValue(%q) returned empty string", tt.field)
			}
		})
	}
}

func TestInboxItem_NewTransaction(t *testing.T) {
	spaceID := SpaceID("spc_" + ksuid.New().String())
	accID := "acc_" + ksuid.New().String()
	bgtID := "bgt_" + ksuid.New().String()

	item := &InboxItem{
		ID:         "ibx_" + ksuid.New().String(),
		SpaceID:    string(spaceID),
		Amount:     5000,
		Currency:   "USD",
		VendorName: "Coffee Shop",
		AccountID:  &accID,
		BudgetID:   &bgtID,
		DocType:    InboxItemDocReceipt,
	}

	txn, err := item.NewTransaction(spaceID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if txn.Type != TransactionTypeExpense {
		t.Errorf("expected expense, got %s", txn.Type)
	}
	if txn.Amount != 5000 {
		t.Errorf("expected amount 5000, got %d", txn.Amount)
	}
	if txn.Description != "Coffee Shop" {
		t.Errorf("expected description 'Coffee Shop', got %s", txn.Description)
	}
}

func TestInboxItem_NewTransfer(t *testing.T) {
	spaceID := SpaceID("spc_" + ksuid.New().String())
	srcAccID := "acc_" + ksuid.New().String()
	destAccID := AccountID("acc_" + ksuid.New().String())

	item := &InboxItem{
		ID:         "ibx_" + ksuid.New().String(),
		SpaceID:    string(spaceID),
		Amount:     12000,
		Currency:   "USD",
		VendorName: "Transfer to Savings",
		AccountID:  &srcAccID,
	}

	transfer, err := item.NewTransfer(spaceID, destAccID)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if transfer.SourceAccountID != AccountID(srcAccID) {
		t.Errorf("expected source account %s, got %s", srcAccID, transfer.SourceAccountID)
	}
	if transfer.DestinationAccountID != destAccID {
		t.Errorf("expected dest account %s, got %s", destAccID, transfer.DestinationAccountID)
	}
	if transfer.SourceAmount != 12000 || transfer.DestinationAmount != 12000 {
		t.Errorf("expected 12000, got %d", transfer.SourceAmount)
	}
}

func TestInboxItem_EnsurePending_Table(t *testing.T) {
	tests := []struct {
		name    string
		status  InboxItemStatus
		wantErr bool
	}{
		{
			name:    "pending status succeeds",
			status:  InboxItemPending,
			wantErr: false,
		},
		{
			name:    "resolved status fails",
			status:  InboxItemResolved,
			wantErr: true,
		},
		{
			name:    "archived status fails",
			status:  InboxItemArchived,
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			item := &InboxItem{Status: tt.status}
			err := item.EnsurePending()
			if (err != nil) != tt.wantErr {
				t.Errorf("EnsurePending() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestInboxItem_MarkResolved(t *testing.T) {
	txnID := TransactionID("txn_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	t.Run("with transaction ID", func(t *testing.T) {
		item := &InboxItem{Status: InboxItemPending}
		item.MarkResolved(&txnID)
		if item.Status != InboxItemResolved {
			t.Errorf("Status = %s, want %s", item.Status, InboxItemResolved)
		}
		if item.TransactionID == nil || *item.TransactionID != string(txnID) {
			t.Errorf("TransactionID = %v, want %s", item.TransactionID, txnID)
		}
	})

	t.Run("with nil transaction ID", func(t *testing.T) {
		item := &InboxItem{Status: InboxItemPending}
		item.MarkResolved(nil)
		if item.Status != InboxItemResolved {
			t.Errorf("Status = %s, want %s", item.Status, InboxItemResolved)
		}
		if item.TransactionID != nil {
			t.Errorf("expected nil TransactionID, got %v", item.TransactionID)
		}
	})
}

func TestInboxItem_Events(t *testing.T) {
	txnID := TransactionID("txn_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	item := &InboxItem{
		ID:         "ibx_123",
		SpaceID:    "spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO",
		Amount:     4500,
		Currency:   "USD",
		VendorName: "Supermarket",
	}

	t.Run("NewReceiptIngestedEvent", func(t *testing.T) {
		event := item.NewReceiptIngestedEvent(txnID)
		if event.EventType != "RECEIPT_INGESTED" {
			t.Errorf("EventType = %s, want RECEIPT_INGESTED", event.EventType)
		}
		if event.TransactionID != txnID {
			t.Errorf("TransactionID = %s, want %s", event.TransactionID, txnID)
		}
	})

	t.Run("NewTransactionLinkedEvent without overwrite", func(t *testing.T) {
		event := item.NewTransactionLinkedEvent(txnID, false)
		if event.EventType != "TRANSACTION_LINKED" {
			t.Errorf("EventType = %s, want TRANSACTION_LINKED", event.EventType)
		}
		if event.Metadata["overwrite_linked_transaction"] != false {
			t.Errorf("overwrite = %v, want false", event.Metadata["overwrite_linked_transaction"])
		}
	})

	t.Run("NewTransactionLinkedEvent with overwrite", func(t *testing.T) {
		event := item.NewTransactionLinkedEvent(txnID, true)
		if event.EventType != "TRANSACTION_LINKED" {
			t.Errorf("EventType = %s, want TRANSACTION_LINKED", event.EventType)
		}
		if event.Metadata["overwrite_linked_transaction"] != true {
			t.Errorf("overwrite = %v, want true", event.Metadata["overwrite_linked_transaction"])
		}
	})
}

func TestInboxItem_NewScheduledTransactionFromInvoice_Table(t *testing.T) {
	spaceID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	budID, _ := NewBudgetID()
	validBudStr := string(budID)
	invalidBudStr := "invalid_bud"

	tests := []struct {
		name       string
		item       InboxItem
		wantErr    bool
		wantBudget bool
	}{
		{
			name: "valid invoice with budget",
			item: InboxItem{
				ID:         "ibx_123",
				BudgetID:   &validBudStr,
				Amount:     15000,
				Currency:   "USD",
				VendorName: "Electric Co",
			},
			wantErr:    false,
			wantBudget: true,
		},
		{
			name: "invalid budget ID fails",
			item: InboxItem{
				ID:         "ibx_123",
				BudgetID:   &invalidBudStr,
				Amount:     15000,
				Currency:   "USD",
				VendorName: "Electric Co",
			},
			wantErr:    true,
			wantBudget: false,
		},
		{
			name: "invoice without budget fails validation",
			item: InboxItem{
				ID:         "ibx_123",
				BudgetID:   nil,
				Amount:     15000,
				Currency:   "USD",
				VendorName: "Electric Co",
			},
			wantErr:    true,
			wantBudget: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			st, err := tt.item.NewScheduledTransactionFromInvoice(spaceID)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewScheduledTransactionFromInvoice() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr {
				if tt.wantBudget && (st.BudgetID == nil || *st.BudgetID != budID) {
					t.Errorf("BudgetID = %v, want %v", st.BudgetID, budID)
				}
				if !tt.wantBudget && st.BudgetID != nil {
					t.Errorf("expected nil BudgetID, got %v", st.BudgetID)
				}
			}
		})
	}
}
