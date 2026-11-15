package financeapp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// UpdateInboxItem updates a staging inbox item's draft properties.
func (c *coordinator) UpdateInboxItem(ctx context.Context, item *finance.InboxItem) (*finance.InboxItem, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.UpdateInboxItem(ctx, rCtx, item)
}

// DiscardInboxItem deletes a staging inbox item without ledger modification.
func (c *coordinator) DiscardInboxItem(ctx context.Context, id string) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DiscardInboxItem(ctx, rCtx, id)
}

// ApproveInboxItem commits a staged inbox item to the main transaction ledger, returning the updated item.
func (c *coordinator) ApproveInboxItem(ctx context.Context, id string) (*finance.InboxItem, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.ApproveInboxItem(ctx, rCtx, id)
}
