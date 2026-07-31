package finance

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

func TestTransferID(t *testing.T) {
	trsfID, err := NewTransferID()
	if err != nil {
		t.Fatalf("unexpected error creating transfer ID: %v", err)
	}
	if err := trsfID.Validate(); err != nil {
		t.Errorf("expected valid transfer ID, got: %v", err)
	}
	if trsfID.String() == "" {
		t.Error("expected non-empty string representation")
	}

	parsed, err := ParseTransferID(string(trsfID))
	if err != nil || parsed != trsfID {
		t.Errorf("failed to parse transfer ID: %v", err)
	}

	mustID := MustTransferID(string(trsfID))
	if mustID != trsfID {
		t.Errorf("MustTransferID mismatch: got %v, want %v", mustID, trsfID)
	}
}

func TestTransfer_Validate(t *testing.T) {
	trsfID, _ := NewTransferID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	srcAccID, _ := NewAccountID()
	dstAccID, _ := NewAccountID()
	now := time.Now()

	tests := []struct {
		name     string
		transfer Transfer
		wantErr  bool
	}{
		{
			name: "valid transfer",
			transfer: Transfer{
				ID:                   trsfID,
				SpaceID:              spaceID,
				SourceAccountID:      srcAccID,
				DestinationAccountID: dstAccID,
				SourceAmount:         10000,
				DestinationAmount:    10000,
				TransferDate:         now,
			},
			wantErr: false,
		},
		{
			name: "same source and destination account",
			transfer: Transfer{
				ID:                   trsfID,
				SpaceID:              spaceID,
				SourceAccountID:      srcAccID,
				DestinationAccountID: srcAccID,
				SourceAmount:         10000,
				DestinationAmount:    10000,
				TransferDate:         now,
			},
			wantErr: true,
		},
		{
			name: "zero source amount",
			transfer: Transfer{
				ID:                   trsfID,
				SpaceID:              spaceID,
				SourceAccountID:      srcAccID,
				DestinationAccountID: dstAccID,
				SourceAmount:         0,
				DestinationAmount:    10000,
				TransferDate:         now,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.transfer.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Transfer.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
