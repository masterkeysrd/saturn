package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type CreateBorrowingRequest struct {
	Direction           string
	Counterparty        string
	ContactInfo         string
	TotalAmount         int64
	Currency            string
	EstablishedAt       time.Time
	DueAt               *time.Time
	Notes               string
	CreateAsTransaction bool
	AccountID           *finance.AccountID
}

func (c *Coordinator) CreateBorrowing(ctx context.Context, req *CreateBorrowingRequest) (*finance.Borrowing, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	b := &finance.Borrowing{
		SpaceID:       rCtx.SpaceID,
		Direction:     finance.BorrowingDirection(req.Direction),
		Counterparty:  req.Counterparty,
		ContactInfo:   req.ContactInfo,
		TotalAmount:   req.TotalAmount,
		Currency:      finance.Currency(req.Currency),
		EstablishedAt: req.EstablishedAt,
		DueAt:         req.DueAt,
		Notes:         req.Notes,
		AccountID:     req.AccountID,
	}

	return c.financeService.CreateBorrowing(ctx, b, req.CreateAsTransaction)
}

type UpdateBorrowingRequest struct {
	ID            finance.BorrowingID
	Direction     string
	Counterparty  string
	ContactInfo   string
	TotalAmount   int64
	Currency      string
	EstablishedAt time.Time
	DueAt         *time.Time
	Notes         string
	AccountID     *finance.AccountID
	Version       int64
	UpdateMask    []string
}

func (c *Coordinator) UpdateBorrowing(ctx context.Context, req *UpdateBorrowingRequest) (*finance.Borrowing, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	b := &finance.Borrowing{
		ID:            req.ID,
		SpaceID:       rCtx.SpaceID,
		Direction:     finance.BorrowingDirection(req.Direction),
		Counterparty:  req.Counterparty,
		ContactInfo:   req.ContactInfo,
		TotalAmount:   req.TotalAmount,
		Currency:      finance.Currency(req.Currency),
		EstablishedAt: req.EstablishedAt,
		DueAt:         req.DueAt,
		Notes:         req.Notes,
		AccountID:     req.AccountID,
		Version:       req.Version,
	}

	return c.financeService.UpdateBorrowing(ctx, b, req.UpdateMask)
}

func (c *Coordinator) DeleteBorrowing(ctx context.Context, id finance.BorrowingID) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	return c.financeService.DeleteBorrowing(ctx, rCtx.SpaceID, id)
}

type AdjustBorrowingBalanceRequest struct {
	BorrowingID    finance.BorrowingID
	TargetBalance  int64
	AdjustmentDate string
	Notes          string
	AccountID      *finance.AccountID
}

func (c *Coordinator) AdjustBorrowingBalance(ctx context.Context, req *AdjustBorrowingBalanceRequest) (*finance.Borrowing, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.AdjustBorrowingBalance(ctx, finance.AdjustBorrowingBalanceRequest{
		SpaceID:        rCtx.SpaceID,
		BorrowingID:    req.BorrowingID,
		TargetBalance:  req.TargetBalance,
		AdjustmentDate: req.AdjustmentDate,
		Note:           req.Notes,
		AccountID:      req.AccountID,
	})
}

type LogBorrowingTransactionRequest struct {
	BorrowingID     finance.BorrowingID
	Type            finance.BorrowingTransactionType
	Amount          int64
	TransactionDate time.Time
	AccountID       *finance.AccountID
	Notes           string
}

func (c *Coordinator) LogBorrowingTransaction(ctx context.Context, req *LogBorrowingTransactionRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.LogBorrowingTransaction(ctx, finance.LogBorrowingTransactionRequest{
		SpaceID:         rCtx.SpaceID,
		BorrowingID:     req.BorrowingID,
		Type:            req.Type,
		Amount:          req.Amount,
		TransactionDate: req.TransactionDate,
		AccountID:       req.AccountID,
		Notes:           req.Notes,
	})
}

type UpdateBorrowingTransactionRequest struct {
	BorrowingID     finance.BorrowingID
	TransactionID   finance.TransactionID
	Type            finance.BorrowingTransactionType
	Amount          int64
	TransactionDate time.Time
	AccountID       *finance.AccountID
	Notes           string
}

func (c *Coordinator) UpdateBorrowingTransaction(ctx context.Context, req *UpdateBorrowingTransactionRequest) (*finance.Transaction, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.UpdateBorrowingTransaction(ctx, finance.UpdateBorrowingTransactionRequest{
		SpaceID:         rCtx.SpaceID,
		BorrowingID:     req.BorrowingID,
		TransactionID:   req.TransactionID,
		Type:            req.Type,
		Amount:          req.Amount,
		TransactionDate: req.TransactionDate,
		AccountID:       req.AccountID,
		Notes:           req.Notes,
	})
}

type DeleteBorrowingTransactionRequest struct {
	BorrowingID   finance.BorrowingID
	TransactionID finance.TransactionID
}

func (c *Coordinator) DeleteBorrowingTransaction(ctx context.Context, req *DeleteBorrowingTransactionRequest) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	return c.financeService.DeleteBorrowingTransaction(ctx, finance.DeleteBorrowingTransactionRequest{
		SpaceID:       rCtx.SpaceID,
		BorrowingID:   req.BorrowingID,
		TransactionID: req.TransactionID,
	})
}
