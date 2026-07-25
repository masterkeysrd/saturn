package financeapp

import (
	"context"
	"strings"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func cleanJSON(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "json")
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		if idx := strings.Index(s, "\n"); idx != -1 {
			s = s[idx+1:]
		} else {
			s = strings.TrimPrefix(s, "```")
		}
		s = strings.TrimSuffix(s, "```")
		s = strings.TrimSpace(s)
	}
	s = strings.TrimPrefix(s, "json")
	s = strings.TrimSpace(s)
	if strings.HasPrefix(s, "```") {
		if idx := strings.Index(s, "\n"); idx != -1 {
			s = s[idx+1:]
		} else {
			s = strings.TrimPrefix(s, "```")
		}
		s = strings.TrimSuffix(s, "```")
		s = strings.TrimSpace(s)
	}
	return s
}

// IngestEmail parses incoming email data, matches budgets/accounts/payments, and inserts it into the staging queue.
func (c *Coordinator) IngestEmail(ctx context.Context, spaceID string, integrationID string, sender, subject, body string) (*finance.InboxItem, error) {
	return c.RunIngestionPipeline(ctx, spaceID, integrationID, sender, subject, body)
}

// DiscardInboxItem deletes a staging inbox item without ledger modification.
func (c *Coordinator) DiscardInboxItem(ctx context.Context, id string) error {
	rctx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DiscardInboxItem(ctx, string(rctx.SpaceID), id)
}

// UpdateInboxItem updates a staging inbox item's draft properties.
func (c *Coordinator) UpdateInboxItem(ctx context.Context, item *finance.InboxItem) (*finance.InboxItem, error) {
	rctx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.UpdateInboxItem(ctx, string(rctx.SpaceID), item)
}

// ApproveInboxItem commits a staged inbox item to the main transaction ledger.
func (c *Coordinator) ApproveInboxItem(ctx context.Context, id string) error {
	rctx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.ApproveInboxItem(ctx, string(rctx.SpaceID), id)
}
