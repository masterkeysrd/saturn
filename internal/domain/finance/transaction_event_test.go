package finance_test

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestTransactionEventID(t *testing.T) {
	eID, err := finance.NewTransactionEventID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tests := []struct {
		name      string
		input     string
		wantPanic bool
		wantErr   bool
	}{
		{"valid event ID", string(eID), false, false},
		{"invalid prefix", "txn_12345", true, true},
		{"empty string", "", true, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := finance.ParseTransactionEventID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseTransactionEventID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if !tt.wantErr {
				if parsed.String() != tt.input {
					t.Errorf("String() = %q, want %q", parsed.String(), tt.input)
				}
				if err := parsed.Validate(); err != nil {
					t.Errorf("Validate() error = %v", err)
				}
			}

			if tt.wantPanic {
				defer func() {
					if r := recover(); r == nil {
						t.Errorf("MustTransactionEventID() did not panic for input %q", tt.input)
					}
				}()
				_ = finance.MustTransactionEventID(tt.input)
			} else {
				must := finance.MustTransactionEventID(tt.input)
				if must != parsed {
					t.Errorf("MustTransactionEventID() = %v, want %v", must, parsed)
				}
			}
		})
	}
}

func TestTransactionEvent_Validate(t *testing.T) {
	validEID, _ := finance.NewTransactionEventID()
	validTID, _ := finance.NewTransactionID()
	validSpace := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	now := time.Now().UTC()

	tests := []struct {
		name    string
		event   finance.TransactionEvent
		wantErr bool
	}{
		{
			name: "valid event",
			event: finance.TransactionEvent{
				ID:            validEID,
				SpaceID:       validSpace,
				TransactionID: validTID,
				EventType:     "MANUAL_CREATION",
				CreateTime:    now,
			},
			wantErr: false,
		},
		{
			name: "invalid event ID",
			event: finance.TransactionEvent{
				ID:            "invalid_id",
				SpaceID:       validSpace,
				TransactionID: validTID,
				EventType:     "MANUAL_CREATION",
				CreateTime:    now,
			},
			wantErr: true,
		},
		{
			name: "invalid space ID",
			event: finance.TransactionEvent{
				ID:            validEID,
				SpaceID:       "invalid_space",
				TransactionID: validTID,
				EventType:     "MANUAL_CREATION",
				CreateTime:    now,
			},
			wantErr: true,
		},
		{
			name: "invalid transaction ID",
			event: finance.TransactionEvent{
				ID:            validEID,
				SpaceID:       validSpace,
				TransactionID: "invalid_tid",
				EventType:     "MANUAL_CREATION",
				CreateTime:    now,
			},
			wantErr: true,
		},
		{
			name: "missing event type",
			event: finance.TransactionEvent{
				ID:            validEID,
				SpaceID:       validSpace,
				TransactionID: validTID,
				EventType:     "",
				CreateTime:    now,
			},
			wantErr: true,
		},
		{
			name: "zero create time",
			event: finance.TransactionEvent{
				ID:            validEID,
				SpaceID:       validSpace,
				TransactionID: validTID,
				EventType:     "MANUAL_CREATION",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.event.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestTransactionEvent_MetadataJSON(t *testing.T) {
	tests := []struct {
		name     string
		metadata map[string]interface{}
		rawJSON  string
	}{
		{
			name:     "with populated metadata",
			metadata: map[string]interface{}{"key": "value", "count": float64(42)},
			rawJSON:  `{"count":42,"key":"value"}`,
		},
		{
			name:     "nil metadata returns empty object",
			metadata: nil,
			rawJSON:  `{}`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			event := &finance.TransactionEvent{Metadata: tt.metadata}
			data, err := event.MetadataJSON()
			if err != nil {
				t.Fatalf("MetadataJSON() error = %v", err)
			}

			// Parse back
			var parsedEvent finance.TransactionEvent
			if err := parsedEvent.ParseMetadataJSON(data); err != nil {
				t.Fatalf("ParseMetadataJSON() error = %v", err)
			}

			// Test empty byte slice to ParseMetadataJSON
			if err := parsedEvent.ParseMetadataJSON([]byte{}); err != nil {
				t.Errorf("ParseMetadataJSON(empty) error = %v", err)
			}
		})
	}
}

func TestTransaction_NewConfirmationEvent(t *testing.T) {
	validTID, _ := finance.NewTransactionID()
	validSpace := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	now := time.Now().UTC()

	txn := &finance.Transaction{
		ID:              validTID,
		SpaceID:         validSpace,
		TransactionDate: now,
	}

	event := txn.NewConfirmationEvent(12500)
	if event == nil {
		t.Fatal("expected non-nil event")
	}
	if event.EventType != "BANK_CONFIRM_RECEIVED" {
		t.Errorf("EventType = %q, want BANK_CONFIRM_RECEIVED", event.EventType)
	}
	if event.SpaceID != validSpace {
		t.Errorf("SpaceID = %q, want %q", event.SpaceID, validSpace)
	}
	if event.TransactionID != validTID {
		t.Errorf("TransactionID = %q, want %q", event.TransactionID, validTID)
	}
	if event.Metadata["actual_amount"] != int64(12500) {
		t.Errorf("actual_amount = %v, want 12500", event.Metadata["actual_amount"])
	}
}
