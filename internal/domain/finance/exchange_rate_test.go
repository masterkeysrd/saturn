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
	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"invalid format", "invalid", true},
		{"too few parts", "rate_USD", true},
		{"invalid from currency", "rate_INVALID_USD_20260730", true},
		{"invalid to currency", "rate_USD_INVALID_20260730", true},
		{"invalid date format", "rate_USD_EUR_invaliddate", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, _, _, err := ParseExchangeRateID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseExchangeRateID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
		})
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
			name: "invalid space ID",
			rate: ExchangeRate{
				SpaceID:      "invalid_space",
				FromCurrency: "EUR",
				ToCurrency:   "USD",
				Rate:         1.08,
				RateDate:     rateDate,
			},
			wantErr: true,
		},
		{
			name: "invalid from currency",
			rate: ExchangeRate{
				SpaceID:      spaceID,
				FromCurrency: "INVALID",
				ToCurrency:   "USD",
				Rate:         1.08,
				RateDate:     rateDate,
			},
			wantErr: true,
		},
		{
			name: "invalid to currency",
			rate: ExchangeRate{
				SpaceID:      spaceID,
				FromCurrency: "EUR",
				ToCurrency:   "INVALID",
				Rate:         1.08,
				RateDate:     rateDate,
			},
			wantErr: true,
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
			name: "negative rate",
			rate: ExchangeRate{
				SpaceID:      spaceID,
				FromCurrency: "EUR",
				ToCurrency:   "USD",
				Rate:         -1.5,
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

func TestExchangeRate_Init(t *testing.T) {
	rateDate, _ := time.Parse("2006-01-02", "2026-07-30")

	tests := []struct {
		name       string
		rate       ExchangeRate
		expectedID string
	}{
		{
			name: "auto-generates ID if empty",
			rate: ExchangeRate{
				FromCurrency: "EUR",
				ToCurrency:   "USD",
				RateDate:     rateDate,
			},
			expectedID: "rate_EUR_USD_20260730",
		},
		{
			name: "keeps ID if already set",
			rate: ExchangeRate{
				ID:           "custom_id",
				FromCurrency: "EUR",
				ToCurrency:   "USD",
				RateDate:     rateDate,
			},
			expectedID: "custom_id",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := tt.rate
			if err := r.Init(); err != nil {
				t.Fatalf("Init() error = %v", err)
			}
			if r.ID != tt.expectedID {
				t.Errorf("r.ID = %q, want %q", r.ID, tt.expectedID)
			}
			if r.CreateTime.IsZero() {
				t.Error("expected CreateTime to be set")
			}
		})
	}
}

func TestExchangeRate_SortFields(t *testing.T) {
	rateDate := time.Date(2026, 7, 30, 0, 0, 0, 0, time.UTC)
	createTime := time.Date(2026, 7, 30, 12, 0, 0, 0, time.UTC)
	rate := &ExchangeRate{
		RateDate:     rateDate,
		FromCurrency: "EUR",
		ToCurrency:   "USD",
		Rate:         1.085,
		CreateTime:   createTime,
	}

	tests := []struct {
		field   string
		isSort  bool
		wantVal string
	}{
		{"rate_date", true, "2026-07-30"},
		{"from_currency", true, "EUR"},
		{"to_currency", true, "USD"},
		{"rate", true, "1.085000"},
		{"create_time", true, createTime.Format(time.RFC3339)},
		{"other", false, "2026-07-30"},
	}

	for _, tt := range tests {
		t.Run(tt.field, func(t *testing.T) {
			if got := IsExchangeRateSortField(tt.field); got != tt.isSort {
				t.Errorf("IsExchangeRateSortField(%q) = %v, want %v", tt.field, got, tt.isSort)
			}
			if got := rate.GetSortValue(tt.field); got != tt.wantVal {
				t.Errorf("rate.GetSortValue(%q) = %q, want %q", tt.field, got, tt.wantVal)
			}
		})
	}
}

func TestConvertAmount(t *testing.T) {
	tests := []struct {
		name   string
		amount int64
		rate   float64
		want   int64
	}{
		{"identity rate 1.0", 1000, 1.0, 1000},
		{"zero amount", 0, 1.5, 0},
		{"positive rate multiplication", 1000, 1.5, 1500},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := ConvertAmount(tt.amount, tt.rate)
			if got != tt.want {
				t.Errorf("ConvertAmount(%d, %f) = %d, want %d", tt.amount, tt.rate, got, tt.want)
			}
		})
	}
}
