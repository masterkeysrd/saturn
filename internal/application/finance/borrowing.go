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

func (c *Coordinator) GetBorrowing(ctx context.Context, id finance.BorrowingID) (*finance.Borrowing, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	b, err := c.financeService.GetBorrowing(ctx, id)
	if err != nil {
		return nil, err
	}

	if b.SpaceID != rCtx.SpaceID {
		return nil, finance.ErrBorrowingNotFound
	}

	return b, nil
}

type ListBorrowingsRequest struct {
	Status        *string
	Direction     *string
	PageSize      int32
	NextPageToken string
}

func (c *Coordinator) ListBorrowings(ctx context.Context, req *ListBorrowingsRequest) ([]*finance.Borrowing, string, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, "", err
	}

	filter := &finance.ListBorrowingsFilter{
		PageSize:      req.PageSize,
		NextPageToken: req.NextPageToken,
	}
	if req.Status != nil {
		status := finance.BorrowingStatus(*req.Status)
		filter.Status = &status
	}
	if req.Direction != nil {
		direction := finance.BorrowingDirection(*req.Direction)
		filter.Direction = &direction
	}

	return c.financeService.ListBorrowings(ctx, rCtx.SpaceID, filter)
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
	}

	return c.financeService.UpdateBorrowing(ctx, b)
}

func (c *Coordinator) DeleteBorrowing(ctx context.Context, id finance.BorrowingID) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	return c.financeService.DeleteBorrowing(ctx, rCtx.SpaceID, id)
}

type CreateBorrowingRepaymentRequest struct {
	BorrowingID finance.BorrowingID
	Amount      int64
	PaymentDate time.Time
	Notes       string
	AccountID   finance.AccountID
}

func (c *Coordinator) CreateBorrowingRepayment(ctx context.Context, req *CreateBorrowingRepaymentRequest) (*finance.BorrowingRepayment, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	r := &finance.BorrowingRepayment{
		SpaceID:     rCtx.SpaceID,
		BorrowingID: req.BorrowingID,
		Amount:      req.Amount,
		PaymentDate: req.PaymentDate,
		Notes:       req.Notes,
		AccountID:   &req.AccountID,
	}

	return c.financeService.CreateBorrowingRepayment(ctx, r)
}

func (c *Coordinator) ListBorrowingRepayments(ctx context.Context, borrowingID finance.BorrowingID) ([]*finance.BorrowingRepayment, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.ListBorrowingRepayments(ctx, rCtx.SpaceID, borrowingID)
}

type DeleteBorrowingRepaymentRequest struct {
	BorrowingID finance.BorrowingID
	ID          finance.BorrowingRepaymentID
}

func (c *Coordinator) DeleteBorrowingRepayment(ctx context.Context, req *DeleteBorrowingRepaymentRequest) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	return c.financeService.DeleteBorrowingRepayment(ctx, finance.DeleteBorrowingRepaymentRequest{
		SpaceID:     rCtx.SpaceID,
		BorrowingID: req.BorrowingID,
		ID:          req.ID,
	})
}
