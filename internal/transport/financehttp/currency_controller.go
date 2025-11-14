package financehttp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
)

type CurrencyController struct {
	app FinanceService
}

func NewCurrencyController(app FinanceService) *CurrencyController {
	return &CurrencyController{
		app: app,
	}
}

func (c *CurrencyController) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("POST /currencies", httphandler.Handle(c.CreateCurrency,
		httphandler.WithCreated[*api.CreateCurrencyRequest, *api.Currency](),
		httphandler.WithInputTransformer[*api.CreateCurrencyRequest, *api.Currency](transformCreateCurrencyInput),
	))

	mux.Handle("GET /currencies", httphandler.Handle(c.ListCurrencies,
		httphandler.WithInputTransformer[*api.ListCurrenciesRequest, *api.ListCurrenciesResponse](transformListCurrenciesInput),
	))
}

func (c *CurrencyController) CreateCurrency(ctx context.Context, req *api.CreateCurrencyRequest) (*api.Currency, error) {
	currency := CurrencyFromAPI(req.Currency)

	if err := c.app.CreateCurrency(ctx, currency); err != nil {
		return nil, fmt.Errorf("cannot create currency: %w", err)
	}

	resp := CurrencyToAPI(currency)
	return resp, nil
}

func (c *CurrencyController) ListCurrencies(ctx context.Context, _ *api.ListCurrenciesRequest) (*api.ListCurrenciesResponse, error) {
	currencies, err := c.app.ListCurrencies(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list currencies: %w", err)
	}

	resp := CurrenciesToAPI(currencies)
	return &api.ListCurrenciesResponse{
		Currencies: &resp,
	}, nil
}

func transformListCurrenciesInput(ctx context.Context, req *http.Request) (*api.ListCurrenciesRequest, error) {
	return &api.ListCurrenciesRequest{}, nil
}

func transformCreateCurrencyInput(ctx context.Context, req *http.Request) (*api.CreateCurrencyRequest, error) {
	var body api.Currency
	if err := json.NewDecoder(req.Body).Decode(&body); err != nil {
		return nil, fmt.Errorf("cannot decode json into body")
	}

	return &api.CreateCurrencyRequest{
		Currency: &body,
	}, nil
}
