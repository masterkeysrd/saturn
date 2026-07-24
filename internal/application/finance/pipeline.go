package financeapp

import (
	"context"
	"encoding/json"
	"fmt"
	"maps"
	"time"

	"github.com/masterkeysrd/loom/graph"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// IngestionState maintains context across the financial document ingestion stages.
type IngestionState struct {
	SpaceID       string
	IntegrationID string
	Sender        string
	Subject       string
	RawPayload    string

	// Node 1: Classifier Output
	Classification string // INVOICE, RECEIPT, BANK_NOTIFICATION, UNKNOWN

	// Node 2: Extractor (Hyperion) Output
	Vendor          string
	Amount          int64
	Currency        string
	Date            string
	CardLastFour    string
	SuggestedBudget string
	Metadata        map[string]any

	// Node 3: Database Entity Resolution Mappings
	AccountID *string
	BudgetID  *string

	// Node 4: Deduplication Warnings
	PotentialDuplicateID *string

	// Node 5: Staging Output
	StagedItem *finance.InboxItem
}

// Copy implements graph.State constraint for IngestionState.
func (s *IngestionState) Copy() *IngestionState {
	if s == nil {
		return nil
	}
	var accID, budID, dupID *string
	if s.AccountID != nil {
		val := *s.AccountID
		accID = &val
	}
	if s.BudgetID != nil {
		val := *s.BudgetID
		budID = &val
	}
	if s.PotentialDuplicateID != nil {
		val := *s.PotentialDuplicateID
		dupID = &val
	}

	var metaCopy map[string]any
	if s.Metadata != nil {
		metaCopy = make(map[string]any)
		maps.Copy(metaCopy, s.Metadata)
	}

	return &IngestionState{
		SpaceID:              s.SpaceID,
		IntegrationID:        s.IntegrationID,
		Sender:               s.Sender,
		Subject:              s.Subject,
		RawPayload:           s.RawPayload,
		Classification:       s.Classification,
		Vendor:               s.Vendor,
		Amount:               s.Amount,
		Currency:             s.Currency,
		Date:                 s.Date,
		CardLastFour:         s.CardLastFour,
		SuggestedBudget:      s.SuggestedBudget,
		Metadata:             metaCopy,
		AccountID:            accID,
		BudgetID:             budID,
		PotentialDuplicateID: dupID,
		StagedItem:           s.StagedItem,
	}
}

// RunIngestionPipeline executes the multi-stage Loom Graph (Classifier -> Extractor -> Resolver -> Deduplicator -> Stager).
func (c *Coordinator) RunIngestionPipeline(ctx context.Context, spaceID string, integrationID string, sender, subject, body string) (*finance.InboxItem, error) {
	// Build the Loom Graph
	g, err := graph.New[*IngestionState]().
		WithName("finance-ingestion").
		AddNode("classify", graph.NodeFunc(c.pipelineClassifyNode)).
		AddNode("extract", graph.NodeFunc(c.pipelineExtractNode)).
		AddNode("resolve", graph.NodeFunc(c.pipelineResolveNode)).
		AddNode("deduplicate", graph.NodeFunc(c.pipelineDeduplicateNode)).
		AddNode("stage", graph.NodeFunc(c.pipelineStageNode)).
		AddEdge(graph.START, "classify").
		AddConditionalEdge("classify", "extract", func(s *IngestionState) bool {
			return s.Classification != "UNKNOWN"
		}).
		AddConditionalEdge("classify", graph.END, func(s *IngestionState) bool {
			return s.Classification == "UNKNOWN"
		}).
		AddEdge("extract", "resolve").
		AddEdge("resolve", "deduplicate").
		AddEdge("deduplicate", "stage").
		AddEdge("stage", graph.END).
		Build()

	if err != nil {
		return nil, fmt.Errorf("compile ingestion graph: %w", err)
	}

	// Initialize workflow state
	initialState := &IngestionState{
		SpaceID:       spaceID,
		IntegrationID: integrationID,
		Sender:        sender,
		Subject:       subject,
		RawPayload:    body,
		Metadata: map[string]any{
			"sender":   sender,
			"subject":  subject,
			"received": time.Now().Format(time.RFC3339),
		},
	}

	// Execute graph synchronously
	snapshot, err := g.Execute(ctx, graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
		return initialState
	}), nil)
	if err != nil {
		return nil, fmt.Errorf("execute ingestion graph: %w", err)
	}

	// Return the staged item compiled in the final node
	if snapshot.State.StagedItem == nil {
		return nil, fmt.Errorf("ingestion graph finished without staging an item (classification: %s)", snapshot.State.Classification)
	}

	return snapshot.State.StagedItem, nil
}

// 1. Classifier Node: Decides if document is INVOICE, RECEIPT, BANK_NOTIFICATION, or UNKNOWN.
func (c *Coordinator) pipelineClassifyNode(ctx context.Context, state *IngestionState) (graph.Command[*IngestionState], error) {
	cls, err := c.classifier.Classify(ctx, state.SpaceID, state.RawPayload)
	if err != nil {
		return nil, fmt.Errorf("classification agent failed: %w", err)
	}

	return graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
		s.Classification = cls
		return s
	}), nil
}

// 2. Extractor Node: Runs Hyperion to pull structured transaction details.
func (c *Coordinator) pipelineExtractNode(ctx context.Context, state *IngestionState) (graph.Command[*IngestionState], error) {
	// Fetch active budgets, accounts, scheduled payments, and recurring expenses to guide matching context
	budgets, _, err := c.financeService.ListBudgets(ctx, finance.SpaceID(state.SpaceID), &finance.ListBudgetsFilter{})
	if err != nil {
		return nil, fmt.Errorf("list budgets: %w", err)
	}

	var accounts []*finance.Account
	if state.Classification != "INVOICE" {
		var err error
		accounts, err = c.financeService.ListAccounts(ctx, finance.SpaceID(state.SpaceID))
		if err != nil {
			return nil, fmt.Errorf("list accounts: %w", err)
		}
	}

	payments, _, err := c.financeService.ListScheduledPayments(ctx, finance.SpaceID(state.SpaceID), &finance.ListScheduledPaymentsFilter{})
	if err != nil {
		return nil, fmt.Errorf("list scheduled payments: %w", err)
	}

	expenses, _, err := c.financeService.ListRecurringExpenses(ctx, finance.SpaceID(state.SpaceID), &finance.ListRecurringExpensesFilter{})
	if err != nil {
		return nil, fmt.Errorf("list recurring expenses: %w", err)
	}

	statusActive := finance.BorrowingStatusActive
	borrowings, _, err := c.financeService.ListBorrowings(ctx, finance.SpaceID(state.SpaceID), &finance.ListBorrowingsFilter{
		Status: &statusActive,
	})
	if err != nil {
		// Log the error but don't fail ingestion if borrowings fail to query
		borrowings = nil
	}

	result, err := c.parser.Parse(ctx, state.SpaceID, state.RawPayload, IngestionContext{
		Budgets:           budgets,
		Accounts:          accounts,
		ScheduledPayments: payments,
		RecurringExpenses: expenses,
		Borrowings:        borrowings,
		ReferenceDate:     time.Now(),
	})
	if err != nil {
		return nil, fmt.Errorf("extractor agent failed: %w", err)
	}

	return graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
		s.Vendor = result.Counterparty
		s.Amount = result.Amount
		s.Currency = result.Currency
		s.Date = result.Date
		s.CardLastFour = result.CardLastFour
		s.SuggestedBudget = result.SuggestedBudget

		s.Metadata["reference_number"] = result.ReferenceNumber
		s.Metadata["suggested_borrowing_id"] = result.SuggestedBorrowing
		s.Metadata["transaction_type"] = result.TransactionType
		s.Metadata["suggested_transfer_leg"] = result.SuggestedTransferLeg
		s.Metadata["raw_agent_output"] = result.RawOutput
		return s
	}), nil
}

// 3. Resolve Node: Queries Saturn DB to match credit card suffix and categories.
func (c *Coordinator) pipelineResolveNode(ctx context.Context, state *IngestionState) (graph.Command[*IngestionState], error) {
	var accountID *string
	if state.Classification != "INVOICE" && state.CardLastFour != "" {
		accounts, err := c.financeService.ListAccounts(ctx, finance.SpaceID(state.SpaceID))
		if err == nil {
			for _, acc := range accounts {
				if acc.LastFour == state.CardLastFour && acc.IsActive {
					val := string(acc.ID)
					accountID = &val
					break
				}
			}
		}
	}

	var budgetID *string
	if state.SuggestedBudget != "" {
		bID, err := finance.ParseBudgetID(state.SuggestedBudget)
		if err == nil {
			budget, err := c.financeService.GetBudget(ctx, bID)
			if err == nil && budget != nil && string(budget.SpaceID) == state.SpaceID {
				val := string(budget.ID)
				budgetID = &val
			}
		}
	}

	return graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
		s.AccountID = accountID
		s.BudgetID = budgetID
		return s
	}), nil
}

// 4. Deduplicate Node: Audits recently logged transactions to flag double-entries.
func (c *Coordinator) pipelineDeduplicateNode(ctx context.Context, state *IngestionState) (graph.Command[*IngestionState], error) {
	transactions, _, err := c.financeService.ListTransactions(ctx, finance.SpaceID(state.SpaceID), &finance.ListTransactionsFilter{
		PageSize: 100,
	})
	if err != nil {
		return nil, fmt.Errorf("list transactions: %w", err)
	}

	parsedTx := &ParsedTransaction{
		Counterparty:    state.Vendor,
		Amount:          state.Amount,
		Currency:        state.Currency,
		Date:            state.Date,
		CardLastFour:    state.CardLastFour,
		SuggestedBudget: state.SuggestedBudget,
	}

	res, err := c.deduplicator.Deduplicate(ctx, state.SpaceID, parsedTx, transactions)
	if err != nil {
		// Log warning but don't fail ingestion if semantic deduplication fails (fall back to non-duplicate)
		fmt.Printf("[Ingestion Pipeline] Warning: semantic deduplication failed: %v\n", err)
		return graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
			return s
		}), nil
	}

	return graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
		if res.IsDuplicate {
			dupID := res.DuplicateTransactionID
			s.PotentialDuplicateID = &dupID
			s.Metadata["duplicate_warning"] = true
			s.Metadata["potential_duplicate_id"] = dupID
			s.Metadata["duplicate_reason"] = res.Reason
		}
		return s
	}), nil
}

// 5. Stage Node: Inserts the resolved entity into Postgres via Domain Service.
func (c *Coordinator) pipelineStageNode(ctx context.Context, state *IngestionState) (graph.Command[*IngestionState], error) {
	metaBytes, _ := json.Marshal(state.Metadata)

	docType := "receipt"
	switch state.Classification {
	case "INVOICE":
		docType = "invoice"
	case "BANK_NOTIFICATION":
		docType = "bank_notification"
	}

	staged, err := c.financeService.StageInboxItem(ctx, state.SpaceID, &finance.StageInboxItem{
		IntegrationID:   state.IntegrationID,
		DocType:         docType,
		Vendor:          state.Vendor,
		Amount:          state.Amount,
		Currency:        state.Currency,
		CardLastFour:    state.CardLastFour,
		SuggestedBudget: state.SuggestedBudget,
		Date:            state.Date,
		RawPayload:      state.RawPayload,
		MetadataJSON:    string(metaBytes),
	})
	if err != nil {
		return nil, fmt.Errorf("stage inbox item: %w", err)
	}

	return graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
		s.StagedItem = staged
		return s
	}), nil
}
