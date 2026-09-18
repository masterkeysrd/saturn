package financeapp

import (
	"context"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestCreateExchangeRateRequest_Validation(t *testing.T) {
	now := time.Now().UTC()
	req := &CreateExchangeRateRequest{
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

	req := &ListExchangeRatesRequest{
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

func TestCoordinator_CreateExchangeRate(t *testing.T) {
	now := time.Now().UTC()
	tests := []struct {
		name          string
		ctx           context.Context
		req           *CreateExchangeRateRequest
		mockFn        func(ctx context.Context, rate *finance.ExchangeRate) (*finance.ExchangeRate, error)
		expectedID    string
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &CreateExchangeRateRequest{
				FromCurrency: "USD",
				ToCurrency:   "EUR",
				Rate:         0.92,
				RateDate:     now,
			},
			mockFn: func(ctx context.Context, rate *finance.ExchangeRate) (*finance.ExchangeRate, error) {
				if rate.SpaceID != "spc_1" || rate.FromCurrency != "USD" || rate.ToCurrency != "EUR" {
					t.Errorf("unexpected rate payload: %+v", rate)
				}
				return &finance.ExchangeRate{ID: "rate_1", SpaceID: rate.SpaceID, Rate: 0.92}, nil
			},
			expectedID:    "rate_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &CreateExchangeRateRequest{FromCurrency: "USD", ToCurrency: "EUR"},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &CreateExchangeRateRequest{FromCurrency: "USD", ToCurrency: "EUR"},
			mockFn: func(ctx context.Context, rate *finance.ExchangeRate) (*finance.ExchangeRate, error) {
				return nil, errors.New("rate creation failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{CreateExchangeRateFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.CreateExchangeRate(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.ID != tc.expectedID {
				t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
			}
		})
	}
}

func TestCoordinator_GetExchangeRate(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *GetExchangeRateRequest
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.ExchangeRate, error)
		expectedID    string
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &GetExchangeRateRequest{ID: "rate_1"},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.ExchangeRate, error) {
				if spaceID != "spc_1" || id != "rate_1" {
					t.Errorf("unexpected get rate args: space=%v id=%v", spaceID, id)
				}
				return &finance.ExchangeRate{ID: id, SpaceID: spaceID}, nil
			},
			expectedID:    "rate_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &GetExchangeRateRequest{ID: "rate_1"},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &GetExchangeRateRequest{ID: "rate_1"},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.ExchangeRate, error) {
				return nil, errors.New("rate not found")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{GetExchangeRateByIDFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.GetExchangeRate(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.ID != tc.expectedID {
				t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
			}
		})
	}
}

func TestCoordinator_UpdateExchangeRate(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *UpdateExchangeRateRequest
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, id string, rate *finance.ExchangeRate) (*finance.ExchangeRate, error)
		expectedID    string
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &UpdateExchangeRateRequest{ID: "rate_1", Rate: 0.95},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id string, rate *finance.ExchangeRate) (*finance.ExchangeRate, error) {
				if spaceID != "spc_1" || id != "rate_1" || rate.Rate != 0.95 {
					t.Errorf("unexpected update args: space=%v id=%v rate=%+v", spaceID, id, rate)
				}
				return &finance.ExchangeRate{ID: id, Rate: rate.Rate}, nil
			},
			expectedID:    "rate_1",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &UpdateExchangeRateRequest{ID: "rate_1"},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &UpdateExchangeRateRequest{ID: "rate_1"},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id string, rate *finance.ExchangeRate) (*finance.ExchangeRate, error) {
				return nil, errors.New("update rate failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{UpdateExchangeRateFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			res, err := coord.UpdateExchangeRate(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if res == nil || res.ID != tc.expectedID {
				t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
			}
		})
	}
}

func TestCoordinator_ListExchangeRates(t *testing.T) {
	from := finance.Currency("USD")
	to := finance.Currency("EUR")
	now := time.Now().UTC()

	tests := []struct {
		name          string
		ctx           context.Context
		req           *ListExchangeRatesRequest
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error)
		expectedCount int
		expectedToken string
		expectedError bool
	}{
		{
			name: "Success with filters",
			ctx:  newTestContext("spc_1", "usr_1"),
			req: &ListExchangeRatesRequest{
				PageSize:     10,
				PageToken:    "tok_1",
				FromCurrency: &from,
				ToCurrency:   &to,
				StartDate:    &now,
				EndDate:      &now,
				OrderBy:      "rate_date desc",
			},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error) {
				if spaceID != "spc_1" || filter.PageSize != 10 || filter.NextPageToken != "tok_1" {
					t.Errorf("unexpected filter: space=%v filter=%+v", spaceID, filter)
				}
				return []*finance.ExchangeRate{{ID: "rate_1"}}, "next_tok", nil
			},
			expectedCount: 1,
			expectedToken: "next_tok",
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &ListExchangeRatesRequest{},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &ListExchangeRatesRequest{},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error) {
				return nil, "", errors.New("query failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{ListExchangeRatesFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			rates, token, err := coord.ListExchangeRates(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if len(rates) != tc.expectedCount || token != tc.expectedToken {
				t.Errorf("expected count %d and token %q, got %d and %q", tc.expectedCount, tc.expectedToken, len(rates), token)
			}
		})
	}
}

func TestCoordinator_DeleteExchangeRate(t *testing.T) {
	tests := []struct {
		name          string
		ctx           context.Context
		req           *DeleteExchangeRateRequest
		mockFn        func(ctx context.Context, spaceID finance.SpaceID, id string) error
		expectedError bool
	}{
		{
			name: "Success",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &DeleteExchangeRateRequest{ID: "rate_1"},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id string) error {
				if spaceID != "spc_1" || id != "rate_1" {
					t.Errorf("unexpected delete args: space=%v id=%v", spaceID, id)
				}
				return nil
			},
			expectedError: false,
		},
		{
			name:          "Unauthenticated",
			ctx:           context.Background(),
			req:           &DeleteExchangeRateRequest{ID: "rate_1"},
			expectedError: true,
		},
		{
			name: "Domain error",
			ctx:  newTestContext("spc_1", "usr_1"),
			req:  &DeleteExchangeRateRequest{ID: "rate_1"},
			mockFn: func(ctx context.Context, spaceID finance.SpaceID, id string) error {
				return errors.New("delete rate failed")
			},
			expectedError: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			fsMock := &FinanceServiceMock{DeleteExchangeRateByIDFunc: tc.mockFn}
			coord := NewCoordinator(Dependencies{FinanceService: fsMock})
			err := coord.DeleteExchangeRate(tc.ctx, tc.req)
			if tc.expectedError {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
		})
	}
}
