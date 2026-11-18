package financeapp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// StageInboxItem validates and persists an inbound financial signal into the inbox queue.
func (c *coordinator) StageInboxItem(ctx context.Context, req *finance.StageInboxItem) (*finance.InboxItem, error) {
	rCtx, err := c.resolveWriteContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.StageInboxItem(ctx, rCtx, req)
}

// UpdateInboxItem updates a staging inbox item's draft properties.
func (c *coordinator) UpdateInboxItem(ctx context.Context, item *finance.InboxItem, mask []string) (*finance.InboxItem, error) {
	rCtx, err := c.resolveWriteContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.UpdateInboxItem(ctx, rCtx, item, mask)
}

// DiscardInboxItem deletes a staging inbox item without ledger modification.
func (c *coordinator) DiscardInboxItem(ctx context.Context, id string) error {
	rCtx, err := c.resolveWriteContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DiscardInboxItem(ctx, rCtx, id)
}

// ApproveInboxItem commits a staged inbox item to the main transaction ledger, returning the updated item.
func (c *coordinator) ApproveInboxItem(ctx context.Context, id string) (*finance.InboxItem, error) {
	rCtx, err := c.resolveWriteContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.ApproveInboxItem(ctx, rCtx, id)
}
