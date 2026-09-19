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

func TestFinanceSettings_Validate(t *testing.T) {
	validSpace := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	tests := []struct {
		name     string
		settings finance.FinanceSettings
		wantErr  bool
	}{
		{
			name: "valid settings",
			settings: finance.FinanceSettings{
				SpaceID:      validSpace,
				BaseCurrency: "USD",
			},
			wantErr: false,
		},
		{
			name: "invalid base currency",
			settings: finance.FinanceSettings{
				SpaceID:      validSpace,
				BaseCurrency: "INVALID",
			},
			wantErr: true,
		},
		{
			name: "invalid space ID",
			settings: finance.FinanceSettings{
				SpaceID:      "invalid_space",
				BaseCurrency: "USD",
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

func TestFinanceSettings_NewDefaultCashAccount(t *testing.T) {
	validSpace := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")

	tests := []struct {
		name     string
		settings finance.FinanceSettings
		wantErr  bool
	}{
		{
			name: "valid cash account generation",
			settings: finance.FinanceSettings{
				SpaceID:      validSpace,
				BaseCurrency: "USD",
			},
			wantErr: false,
		},
		{
			name: "invalid settings fails account validation",
			settings: finance.FinanceSettings{
				SpaceID:      "invalid_space",
				BaseCurrency: "USD",
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
