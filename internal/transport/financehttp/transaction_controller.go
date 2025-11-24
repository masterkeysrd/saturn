package financehttp

import (
	"context"
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
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

	mux.Handle("GET /transactions/{id}", httphandler.Handle(c.GetTransaction,
		httphandler.WithInputTransformer[*api.GetTransactionRequest, *api.Transaction](transformGetTransactionInput),
	))
}

func (c *TransactionController) GetTransaction(ctx context.Context, req *api.GetTransactionRequest) (*api.Transaction, error) {
	trx, err := c.app.GetTransaction(ctx, finance.TransactionID(req.ID))
	if err != nil {
		return nil, fmt.Errorf("cannot list transactions: %w", err)
	}

	return TransactionToAPI(trx), nil
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

func transformGetTransactionInput(ctx context.Context, r *http.Request) (*api.GetTransactionRequest, error) {
	id := r.PathValue("id")
	if id == "" {
		return nil, fmt.Errorf("expense id is required")
	}

	return &api.GetTransactionRequest{
		ID: id,
	}, nil
}

func transformListTransactionsInput(ctx context.Context, _ *http.Request) (*api.ListTransactionsRequest, error) {
	return &api.ListTransactionsRequest{}, nil
}
