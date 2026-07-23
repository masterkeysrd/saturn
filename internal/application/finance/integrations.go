package financeapp

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// IngestEmail parses incoming email data, matches budgets/accounts/payments, and inserts it into the staging queue.
func (c *Coordinator) IngestEmail(ctx context.Context, spaceID string, integrationID string, sender, subject, body string) (*finance.PendingTransaction, error) {
	// 1. Fetch active budgets for the space to guide categorization
	budgets, _, err := c.financeService.ListBudgets(ctx, finance.SpaceID(spaceID), &finance.ListBudgetsFilter{})
	if err != nil {
		return nil, fmt.Errorf("list budgets: %w", err)
	}
	budgetNames := make([]string, len(budgets))
	for i, b := range budgets {
		budgetNames[i] = b.Name
	}

	// 2. Call the Gemini LLM Client to parse unstructured text
	parsed, err := c.geminiClient.ParseEmail(ctx, body, budgetNames)
	if err != nil {
		return nil, fmt.Errorf("gemini parse email: %w", err)
	}

	// 3. Build metadata payload
	meta := map[string]string{
		"sender":   sender,
		"subject":  subject,
		"received": time.Now().Format(time.RFC3339),
	}
	metaBytes, _ := json.Marshal(meta)

	// 4. Delegate to the pure finance domain service to resolve matching budgets/accounts and stage
	return c.financeService.StageTransaction(ctx, spaceID, &finance.StageTransaction{
		IntegrationID:   integrationID,
		Vendor:          parsed.Vendor,
		Amount:          parsed.Amount,
		Currency:        parsed.Currency,
		CardLastFour:    parsed.CardLastFour,
		SuggestedBudget: parsed.SuggestedBudget,
		Date:            parsed.Date,
		MetadataJSON:    string(metaBytes),
	})
}

// ListPendingTransactions lists all staging transactions waiting in the workspace queue.
func (c *Coordinator) ListPendingTransactions(ctx context.Context) ([]*finance.PendingTransaction, error) {
	rctx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.ListPendingTransactions(ctx, string(rctx.SpaceID))
}

// DiscardPendingTransaction deletes a staging transaction without ledger modification.
func (c *Coordinator) DiscardPendingTransaction(ctx context.Context, id string) error {
	rctx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DiscardPendingTransaction(ctx, string(rctx.SpaceID), id)
}

// ApprovePendingTransaction commits a staged pending transaction to the main transaction ledger.
func (c *Coordinator) ApprovePendingTransaction(ctx context.Context, req *finance.ApprovePendingTransaction) (*finance.Transaction, error) {
	rctx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.financeService.ApprovePendingTransaction(ctx, string(rctx.SpaceID), req)
}
