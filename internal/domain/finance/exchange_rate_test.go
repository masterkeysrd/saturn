package finance

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

func TestExchangeRate_ComputeIDAndParse(t *testing.T) {
	rateDate, _ := time.Parse("2006-01-02", "2026-07-30")
	rate := &ExchangeRate{
		FromCurrency: "EUR",
		ToCurrency:   "USD",
		RateDate:     rateDate,
	}

	computedID := rate.ComputeID()
	expectedID := "rate_EUR_USD_20260730"
	if computedID != expectedID {
		t.Errorf("ComputeID() = %q, want %q", computedID, expectedID)
	}

	from, to, parsedDate, err := ParseExchangeRateID(computedID)
	if err != nil {
		t.Fatalf("ParseExchangeRateID failed: %v", err)
	}
	if from != "EUR" || to != "USD" || !parsedDate.Equal(rateDate) {
		t.Errorf("ParseExchangeRateID mismatch: got (%v, %v, %v)", from, to, parsedDate)
	}
}

func TestParseExchangeRateID_Invalid(t *testing.T) {
	invalidIDs := []string{
		"invalid",
		"rate_USD",
		"rate_INVALID_USD_20260730",
		"rate_USD_EUR_invaliddate",
	}
	for _, id := range invalidIDs {
		_, _, _, err := ParseExchangeRateID(id)
		if err == nil {
			t.Errorf("expected error for invalid ID %q, got nil", id)
		}
	}
}

func TestExchangeRate_Validate(t *testing.T) {
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	rateDate := time.Now()

	tests := []struct {
		name    string
		rate    ExchangeRate
		wantErr bool
	}{
		{
			name: "valid rate",
			rate: ExchangeRate{
				SpaceID:      spaceID,
				FromCurrency: "EUR",
				ToCurrency:   "USD",
				Rate:         1.08,
				RateDate:     rateDate,
			},
			wantErr: false,
		},
		{
			name: "zero rate",
			rate: ExchangeRate{
				SpaceID:      spaceID,
				FromCurrency: "EUR",
				ToCurrency:   "USD",
				Rate:         0,
				RateDate:     rateDate,
			},
			wantErr: true,
		},
		{
			name: "missing rate date",
			rate: ExchangeRate{
				SpaceID:      spaceID,
				FromCurrency: "EUR",
				ToCurrency:   "USD",
				Rate:         1.08,
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.rate.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("ExchangeRate.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
