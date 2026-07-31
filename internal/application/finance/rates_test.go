package financeapp_test

import (
	"testing"
	"time"

	financeapp "github.com/masterkeysrd/saturn/internal/application/finance"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestCreateExchangeRateRequest_Validation(t *testing.T) {
	now := time.Now().UTC()
	req := &financeapp.CreateExchangeRateRequest{
		FromCurrency: "EUR",
		ToCurrency:   "USD",
		Rate:         1.085,
		RateDate:     now,
	}

	if req.FromCurrency != "EUR" || req.ToCurrency != "USD" {
		t.Errorf("unexpected currency pair: %s/%s", req.FromCurrency, req.ToCurrency)
	}
	if req.Rate != 1.085 {
		t.Errorf("unexpected rate: %f", req.Rate)
	}
}

func TestListExchangeRatesRequest_Filters(t *testing.T) {
	from := finance.Currency("EUR")
	to := finance.Currency("USD")
	now := time.Now().UTC()

	req := &financeapp.ListExchangeRatesRequest{
		PageSize:     15,
		PageToken:    "token_123",
		FromCurrency: &from,
		ToCurrency:   &to,
		StartDate:    &now,
		EndDate:      &now,
		OrderBy:      "rate_date desc",
	}

	if req.PageSize != 15 || req.PageToken != "token_123" {
		t.Errorf("unexpected pagination parameters")
	}
	if *req.FromCurrency != "EUR" || *req.ToCurrency != "USD" {
		t.Errorf("unexpected currencies in filter")
	}
}
