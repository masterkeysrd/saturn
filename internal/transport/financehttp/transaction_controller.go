package financehttp

import (
	"context"
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
)

type TransactionController struct {
	app FinanceService
}

func NewTransactionController(app FinanceService) *TransactionController {
	return &TransactionController{
		app: app,
	}
}

func (c *TransactionController) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET /transactions", httphandler.Handle(c.ListTransactions,
		httphandler.WithInputTransformer[*api.ListTransactionsRequest, *api.ListTransactionsResponse](transformListTransactionsInput),
	))
}

func (c *TransactionController) ListTransactions(ctx context.Context, req *api.ListTransactionsRequest) (*api.ListTransactionsResponse, error) {
	trxs, err := c.app.ListTransactions(ctx)
	if err != nil {
		return nil, fmt.Errorf("cannot list transactions: %w", err)
	}

	resp := TransactionsToAPI(trxs)

	return &api.ListTransactionsResponse{
		Transactions: resp,
	}, nil
}

func transformListTransactionsInput(ctx context.Context, _ *http.Request) (*api.ListTransactionsRequest, error) {
	return &api.ListTransactionsRequest{}, nil
}
