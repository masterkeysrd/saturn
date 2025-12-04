package financehttp

import (
	"context"
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/httphandler"
	"github.com/masterkeysrd/saturn/internal/transport/http/encoding"
	"github.com/masterkeysrd/saturn/internal/transport/http/response"
)

type TransactionController struct {
	service       FinanceService
	searchService FinanceSearchService
}

func NewTransactionController(app FinanceService, searchService FinanceSearchService) *TransactionController {
	return &TransactionController{
		service:       app,
		searchService: searchService,
	}
}

func (c *TransactionController) RegisterRoutes(mux *http.ServeMux) {
	mux.Handle("GET /transactions", httphandler.Handle(c.ListTransactions,
		httphandler.WithInputTransformer[*api.ListTransactionsRequest, *api.ListTransactionsResponse](transformListTransactionsInput),
	))

	mux.Handle("GET /transactions/{id}", httphandler.Handle(c.GetTransaction,
		httphandler.WithInputTransformer[*api.GetTransactionRequest, *api.Transaction](transformGetTransactionInput),
	))

	mux.Handle("DELETE /transactions/{id}", httphandler.Handle(c.DeleteTransaction,
		httphandler.WithInputTransformer[*api.DeleteTransactionRequest, *httphandler.Empty](transformDeleteTransactionInput),
	))
}

func (c *TransactionController) GetTransaction(ctx context.Context, req *api.GetTransactionRequest) (*api.Transaction, error) {
	trx, err := c.service.GetTransaction(ctx, finance.TransactionID(req.ID))
	if err != nil {
		return nil, fmt.Errorf("cannot get transaction: %w", err)
	}

	return TransactionToAPI(trx), nil
}

func (c *TransactionController) ListTransactions(ctx context.Context, req *api.ListTransactionsRequest) (*api.ListTransactionsResponse, error) {
	trxs, err := c.searchService.SearchTransactions(ctx, &finance.TransactionSearchInput{
		Term:       req.Search,
		Pagination: req.Paginate.ToPagination(),
	})
	if err != nil {
		return nil, fmt.Errorf("cannot list transactions: %w", err)
	}

	resp := TransactionItemsToAPI(trxs.Items())
	return &api.ListTransactionsResponse{
		Transactions: resp,
		Meta:         response.NewMeta(trxs),
	}, nil
}

func (c *TransactionController) DeleteTransaction(ctx context.Context, req *api.DeleteTransactionRequest) (*httphandler.Empty, error) {
	if err := c.service.DeleteTransaction(ctx, finance.TransactionID(req.ID)); err != nil {
		return nil, fmt.Errorf("cannot list transactions: %w", err)
	}

	return &httphandler.Empty{}, nil
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

func transformListTransactionsInput(ctx context.Context, req *http.Request) (*api.ListTransactionsRequest, error) {
	var p api.PaginationRequest
	if err := encoding.DecodePagination(req, &p); err != nil {
		return nil, fmt.Errorf("invalid pagination params: %w", err)
	}

	return &api.ListTransactionsRequest{
		Search:   encoding.GetStringQuery(req, "search", ""),
		Paginate: p,
	}, nil
}

func transformDeleteTransactionInput(ctx context.Context, r *http.Request) (*api.DeleteTransactionRequest, error) {
	id := r.PathValue("id")
	if id == "" {
		return nil, fmt.Errorf("expense id is required")
	}

	return &api.DeleteTransactionRequest{
		ID: id,
	}, nil
}
