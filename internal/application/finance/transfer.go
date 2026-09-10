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

func (c *coordinator) CreateTransfer(ctx context.Context, req *CreateTransferRequest) (*finance.Transfer, error) {
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

func (c *coordinator) GetTransfer(ctx context.Context, id finance.TransferID) (*finance.Transfer, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.GetTransfer(ctx, rCtx.SpaceID, id)
}

func (c *coordinator) DeleteTransfer(ctx context.Context, id finance.TransferID) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	return c.financeService.DeleteTransfer(ctx, rCtx.SpaceID, id)
}

func (c *coordinator) ListTransfers(ctx context.Context, req *ListTransfersRequest) ([]*finance.Transfer, string, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, "", err
	}

	return c.financeService.ListTransfers(ctx, rCtx.SpaceID, req.Limit, req.PageToken)
}
