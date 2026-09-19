package finance_test

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestPeriodID(t *testing.T) {
	pID, err := finance.NewPeriodID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tests := []struct {
		name      string
		input     string
		wantPanic bool
		wantErr   bool
	}{
		{
			name:      "valid period ID",
			input:     string(pID),
			wantPanic: false,
			wantErr:   false,
		},
		{
			name:      "invalid prefix",
			input:     "bgt_12345",
			wantPanic: true,
			wantErr:   true,
		},
		{
			name:      "empty string",
			input:     "",
			wantPanic: true,
			wantErr:   true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := finance.ParsePeriodID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParsePeriodID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
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
						t.Errorf("MustPeriodID() did not panic for input %q", tt.input)
					}
				}()
				_ = finance.MustPeriodID(tt.input)
			} else {
				must := finance.MustPeriodID(tt.input)
				if must != parsed {
					t.Errorf("MustPeriodID() = %v, want %v", must, parsed)
				}
			}
		})
	}
}

func TestBudgetPeriod_Validate(t *testing.T) {
	validPID, _ := finance.NewPeriodID()
	validBID, _ := finance.NewBudgetID()
	validSpace := finance.SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	now := time.Now().UTC()

	tests := []struct {
		name    string
		period  finance.BudgetPeriod
		wantErr bool
	}{
		{
			name: "valid budget period",
			period: finance.BudgetPeriod{
				ID:                 validPID,
				BudgetID:           validBID,
				SpaceID:            validSpace,
				StartDate:          now,
				EndDate:            now.AddDate(0, 1, 0),
				LimitAmount:        50000,
				Currency:           "USD",
				BaseCurrency:       "USD",
				ExchangeRateToBase: 1.0,
			},
			wantErr: false,
		},
		{
			name: "invalid period ID",
			period: finance.BudgetPeriod{
				ID:                 "invalid_pid",
				BudgetID:           validBID,
				SpaceID:            validSpace,
				StartDate:          now,
				EndDate:            now.AddDate(0, 1, 0),
				LimitAmount:        50000,
				Currency:           "USD",
				BaseCurrency:       "USD",
				ExchangeRateToBase: 1.0,
			},
			wantErr: true,
		},
		{
			name: "invalid budget ID",
			period: finance.BudgetPeriod{
				ID:                 validPID,
				BudgetID:           "invalid_bid",
				SpaceID:            validSpace,
				StartDate:          now,
				EndDate:            now.AddDate(0, 1, 0),
				LimitAmount:        50000,
				Currency:           "USD",
				BaseCurrency:       "USD",
				ExchangeRateToBase: 1.0,
			},
			wantErr: true,
		},
		{
			name: "invalid space ID",
			period: finance.BudgetPeriod{
				ID:                 validPID,
				BudgetID:           validBID,
				SpaceID:            "invalid_space",
				StartDate:          now,
				EndDate:            now.AddDate(0, 1, 0),
				LimitAmount:        50000,
				Currency:           "USD",
				BaseCurrency:       "USD",
				ExchangeRateToBase: 1.0,
			},
			wantErr: true,
		},
		{
			name: "start after end",
			period: finance.BudgetPeriod{
				ID:                 validPID,
				BudgetID:           validBID,
				SpaceID:            validSpace,
				StartDate:          now.AddDate(0, 1, 0),
				EndDate:            now,
				LimitAmount:        50000,
				Currency:           "USD",
				BaseCurrency:       "USD",
				ExchangeRateToBase: 1.0,
			},
			wantErr: true,
		},
		{
			name: "limit <= 0",
			period: finance.BudgetPeriod{
				ID:                 validPID,
				BudgetID:           validBID,
				SpaceID:            validSpace,
				StartDate:          now,
				EndDate:            now.AddDate(0, 1, 0),
				LimitAmount:        0,
				Currency:           "USD",
				BaseCurrency:       "USD",
				ExchangeRateToBase: 1.0,
			},
			wantErr: true,
		},
		{
			name: "invalid currency",
			period: finance.BudgetPeriod{
				ID:                 validPID,
				BudgetID:           validBID,
				SpaceID:            validSpace,
				StartDate:          now,
				EndDate:            now.AddDate(0, 1, 0),
				LimitAmount:        50000,
				Currency:           "INVALID",
				BaseCurrency:       "USD",
				ExchangeRateToBase: 1.0,
			},
			wantErr: true,
		},
		{
			name: "invalid base currency",
			period: finance.BudgetPeriod{
				ID:                 validPID,
				BudgetID:           validBID,
				SpaceID:            validSpace,
				StartDate:          now,
				EndDate:            now.AddDate(0, 1, 0),
				LimitAmount:        50000,
				Currency:           "USD",
				BaseCurrency:       "INVALID",
				ExchangeRateToBase: 1.0,
			},
			wantErr: true,
		},
		{
			name: "exchange rate <= 0",
			period: finance.BudgetPeriod{
				ID:                 validPID,
				BudgetID:           validBID,
				SpaceID:            validSpace,
				StartDate:          now,
				EndDate:            now.AddDate(0, 1, 0),
				LimitAmount:        50000,
				Currency:           "USD",
				BaseCurrency:       "USD",
				ExchangeRateToBase: 0,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.period.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestBudgetPeriod_UpdateLimit(t *testing.T) {
	tests := []struct {
		name     string
		newLimit int64
		wantErr  bool
	}{
		{"positive limit", 60000, false},
		{"zero limit", 0, true},
		{"negative limit", -100, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			p := &finance.BudgetPeriod{LimitAmount: 50000}
			err := p.UpdateLimit(tt.newLimit)
			if (err != nil) != tt.wantErr {
				t.Errorf("UpdateLimit(%d) error = %v, wantErr %v", tt.newLimit, err, tt.wantErr)
			}
			if !tt.wantErr && p.LimitAmount != tt.newLimit {
				t.Errorf("LimitAmount = %d, want %d", p.LimitAmount, tt.newLimit)
			}
		})
	}
}
