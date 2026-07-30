package financeapp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	agentapp "github.com/masterkeysrd/saturn/internal/application/agent"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func cleanJSON(s string) string {
	s = strings.TrimSpace(s)
	s = strings.TrimPrefix(s, "json")
	s = strings.TrimSpace(s)
	if after, ok := strings.CutPrefix(s, "```"); ok {
		if idx := strings.Index(s, "\n"); idx != -1 {
			s = s[idx+1:]
		} else {
			s = after
		}
		s = strings.TrimSuffix(s, "```")
		s = strings.TrimSpace(s)
	}
	s = strings.TrimPrefix(s, "json")
	s = strings.TrimSpace(s)
	if after, ok := strings.CutPrefix(s, "```"); ok {
		if idx := strings.Index(s, "\n"); idx != -1 {
			s = s[idx+1:]
		} else {
			s = after
		}
		s = strings.TrimSuffix(s, "```")
		s = strings.TrimSpace(s)
	}
	return s
}

// IngestEmail parses incoming email data, matches budgets/accounts/payments, and inserts it into the staging queue.
func (c *Coordinator) IngestEmail(ctx context.Context, spaceID string, integrationID string, sender, subject, body string) (*finance.InboxItem, error) {
	req := &IngestionRequest{
		TextContent: body,
		Metadata: map[string]any{
			"integration_id": integrationID,
			"sender":         sender,
			"subject":        subject,
		},
	}

	state, err := c.ProcessSignalPipeline(ctx, spaceID, req)
	if err != nil {
		return nil, err
	}

	if state.Classification == "UNKNOWN" {
		return nil, fmt.Errorf("signal classification unknown")
	}

	metaBytes, _ := json.Marshal(state.Metadata)

	docType := finance.ParseInboxItemDocType(state.Classification)

	rawPayload := ""
	if state.Request != nil {
		rawPayload = state.Request.TextContent
	}

	staged, err := c.financeService.StageInboxItem(ctx, spaceID, &finance.StageInboxItem{
		IntegrationID:   integrationID,
		DocType:         docType,
		Vendor:          state.Vendor,
		Amount:          state.Amount,
		Currency:        state.Currency,
		CardLastFour:    state.CardLastFour,
		SuggestedBudget: state.SuggestedBudget,
		Date:            state.Date,
		RawPayload:      rawPayload,
		MetadataJSON:    string(metaBytes),
	})
	if err != nil {
		return nil, fmt.Errorf("stage inbox item: %w", err)
	}

	return staged, nil
}

// DiscardInboxItem deletes a staging inbox item without ledger modification.
func (c *Coordinator) DiscardInboxItem(ctx context.Context, id string) error {
	rctx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}
	return c.financeService.DiscardInboxItem(ctx, string(rctx.SpaceID), id)
}

// GetTransactionSuggestions analyzes raw signal payloads and returns real-time form prefill suggestions.
func (c *Coordinator) GetTransactionSuggestions(ctx context.Context, req *IngestionRequest) (*SignalSuggestion, error) {
	rctx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}
	return c.GetSignalSuggestions(ctx, string(rctx.SpaceID), req)
}

// ProcessSuggestions implements agentapp.SuggestionProcessor for transaction_extractor purpose.
func (c *Coordinator) ProcessSuggestions(ctx context.Context, spaceID string, req *agentapp.SuggestionRequest) (map[string]any, error) {
	ingReq := &IngestionRequest{
		TextContent: req.TextContent,
		Metadata:    req.Metadata,
	}
	for _, d := range req.Documents {
		ingReq.Documents = append(ingReq.Documents, DocumentFile{
			Filename:    d.Filename,
			ContentType: d.ContentType,
			Content:     d.Content,
		})
	}

	sug, err := c.GetSignalSuggestions(ctx, spaceID, ingReq)
	if err != nil {
		return nil, err
	}

	res := map[string]any{
		"classification": sug.Classification,
		"vendor":         sug.Vendor,
		"amount":         sug.Amount,
		"currency":       sug.Currency,
		"date":           sug.Date,
	}
	if sug.CardLastFour != "" {
		res["cardLastFour"] = sug.CardLastFour
	}
	if sug.SuggestedBudget != "" {
		res["suggestedBudget"] = sug.SuggestedBudget
	}
	if sug.AccountID != nil {
		res["accountId"] = *sug.AccountID
	}
	if sug.BudgetID != nil {
		res["budgetId"] = *sug.BudgetID
	}
	if sug.PotentialDuplicateID != nil {
		res["potentialDuplicateId"] = *sug.PotentialDuplicateID
	}
	return res, nil
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
