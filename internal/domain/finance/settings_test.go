package finance_test

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestSpaceID(t *testing.T) {
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid space ID", "spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO", false},
		{"invalid prefix", "usr_2dE1V8ZqWz4eS2N9yX3bL1mK7pO", true},
		{"empty string", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			sid, err := finance.ParseSpaceID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Fatalf("ParseSpaceID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if !tt.wantErr {
				if sid.String() != tt.input {
					t.Errorf("String() = %q, want %q", sid.String(), tt.input)
				}
				if err := sid.Validate(); err != nil {
					t.Errorf("Validate() error = %v", err)
				}
			}
		})
	}
}

func TestSettings_Validate(t *testing.T) {
	tests := []struct {
		name     string
		settings finance.Settings
		wantErr  bool
	}{
		{
			name: "valid settings",
			settings: finance.Settings{
				BaseCurrency: "USD",
			},
			wantErr: false,
		},
		{
			name: "invalid base currency",
			settings: finance.Settings{
				BaseCurrency: "INVALID",
			},
			wantErr: true,
		},
		{
			name: "empty base currency",
			settings: finance.Settings{
				BaseCurrency: "",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.settings.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestSettings_NewDefaultCashAccount(t *testing.T) {
	tests := []struct {
		name     string
		settings finance.Settings
		wantErr  bool
	}{
		{
			name: "valid cash account generation",
			settings: finance.Settings{
				BaseCurrency: "USD",
			},
			wantErr: false,
		},
		{
			name: "invalid settings fails account validation",
			settings: finance.Settings{
				BaseCurrency: "INVALID",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			acc, err := tt.settings.NewDefaultCashAccount()
			if (err != nil) != tt.wantErr {
				t.Fatalf("NewDefaultCashAccount() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr {
				if acc.Name != "Cash" {
					t.Errorf("acc.Name = %q, want Cash", acc.Name)
				}
				if acc.Type != finance.AccountTypeCash {
					t.Errorf("acc.Type = %q, want CASH", acc.Type)
				}
				if acc.Currency != "USD" {
					t.Errorf("acc.Currency = %q, want USD", acc.Currency)
				}
				if !acc.IsActive {
					t.Errorf("expected acc.IsActive = true")
				}
			}
		})
	}
}
