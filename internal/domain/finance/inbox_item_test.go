package finance

import (
	"testing"
	"time"
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
