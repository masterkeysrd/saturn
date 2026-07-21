package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type CreateTransferRequest struct {
	SourceAccountID      string
	DestinationAccountID string
	SourceAmount         int64
	DestinationAmount    int64
	TransferDate         time.Time
	Notes                string
}

type ListTransfersRequest struct {
	Limit     int32
	PageToken string
}

func (c *Coordinator) CreateTransfer(ctx context.Context, req *CreateTransferRequest) (*finance.Transfer, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	transfer := &finance.Transfer{
		SpaceID:              rCtx.SpaceID,
		SourceAccountID:      finance.AccountID(req.SourceAccountID),
		DestinationAccountID: finance.AccountID(req.DestinationAccountID),
		SourceAmount:         req.SourceAmount,
		DestinationAmount:    req.DestinationAmount,
		TransferDate:         req.TransferDate,
		Notes:                req.Notes,
	}

	return c.financeService.CreateTransfer(ctx, transfer)
}

func (c *Coordinator) GetTransfer(ctx context.Context, id finance.TransferID) (*finance.Transfer, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	t, err := c.financeService.GetTransfer(ctx, id)
	if err != nil {
		return nil, err
	}

	if t.SpaceID != rCtx.SpaceID {
		return nil, finance.ErrTransferNotFound
	}

	return t, nil
}

func (c *Coordinator) DeleteTransfer(ctx context.Context, id finance.TransferID) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	t, err := c.financeService.GetTransfer(ctx, id)
	if err != nil {
		return err
	}

	if t.SpaceID != rCtx.SpaceID {
		return finance.ErrTransferNotFound
	}

	return c.financeService.DeleteTransfer(ctx, id)
}

func (c *Coordinator) ListTransfers(ctx context.Context, req *ListTransfersRequest) ([]*finance.Transfer, string, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, "", err
	}

	return c.financeService.ListTransfers(ctx, rCtx.SpaceID, req.Limit, req.PageToken)
}
