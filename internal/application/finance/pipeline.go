package financeapp

import (
	"context"
	"fmt"
	"maps"
	"strings"
	"time"

	"github.com/masterkeysrd/loom/graph"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

const (
	// Deduplication thresholds
	dedupAmountMinFactor = 0.70 // 30% lower tolerance bound to account for tax-exclusive subtotals
	dedupAmountMaxFactor = 1.30 // 30% upper tolerance bound to account for tax-inclusive totals
	dedupDateRangeDays   = 10   // ±10 days window to account for delays in settlement
	dedupMaxCandidates   = 10   // Maximum candidate transactions to send to the deduplication agent
)

// DocumentFile represents an individual attached file (receipt image, invoice PDF, etc.).
type DocumentFile struct {
	Filename    string `json:"filename"`
	ContentType string `json:"contentType"`
	Content     []byte `json:"content"`
}

// IngestionRequest holds generic incoming signal data for processing.
type IngestionRequest struct {
	TextContent string         `json:"textContent"`
	Documents   []DocumentFile `json:"documents"`
	Metadata    map[string]any `json:"metadata"`
}

// IngestionState maintains context across the financial signal processing stages.
type IngestionState struct {
	SpaceID string
	Request *IngestionRequest

	// Node 1: Classifier Output
	Classification string // INVOICE, RECEIPT, BANK_NOTIFICATION, SYSTEM_VERIFICATION, UNKNOWN

	// Node 2: Extractor Output
	Vendor          string
	Amount          int64
	Currency        string
	Date            string
	CardLastFour    string
	SuggestedBudget string

	// Node 3: Database Entity Resolution Mappings
	AccountID *string
	BudgetID  *string

	// Node 4: Deduplication Warnings
	PotentialDuplicateID *string

	// Node 5: Staging Output (optional, populated when staged)
	StagedItem *finance.InboxItem

	// Extracted metadata accumulators
	Metadata map[string]any
}

// Copy implements graph.State constraint for IngestionState.
func (s *IngestionState) Copy() *IngestionState {
	if s == nil {
		return nil
	}
	var accID, budID, dupID *string
	if s.AccountID != nil {
		accID = new(*s.AccountID)
	}
	if s.BudgetID != nil {
		budID = new(*s.BudgetID)
	}
	if s.PotentialDuplicateID != nil {
		dupID = new(*s.PotentialDuplicateID)
	}

	var metaCopy map[string]any
	if s.Metadata != nil {
		metaCopy = make(map[string]any)
		maps.Copy(metaCopy, s.Metadata)
	}

	return &IngestionState{
		SpaceID:              s.SpaceID,
		Request:              s.Request,
		Metadata:             metaCopy,
		Classification:       s.Classification,
		Vendor:               s.Vendor,
		Amount:               s.Amount,
		Currency:             s.Currency,
		Date:                 s.Date,
		CardLastFour:         s.CardLastFour,
		SuggestedBudget:      s.SuggestedBudget,
		AccountID:            accID,
		BudgetID:             budID,
		PotentialDuplicateID: dupID,
		StagedItem:           s.StagedItem,
	}
}

// MetadataString safely retrieves a string value from state Metadata map.
func (s *IngestionState) MetadataString(key string) string {
	if s == nil || s.Metadata == nil {
		return ""
	}
	if v, ok := s.Metadata[key].(string); ok {
		return v
	}
	return ""
}

// ProcessSignalPipeline executes the core Loom Graph (Classifier -> Extractor -> Resolver -> Deduplicator).
// Returns the enriched IngestionState without performing side-effects (e.g. DB staging).
func (c *Coordinator) ProcessSignalPipeline(ctx context.Context, spaceID string, req *IngestionRequest) (*IngestionState, error) {
	if req == nil {
		req = &IngestionRequest{}
	}
	meta := make(map[string]any)
	if req.Metadata != nil {
		maps.Copy(meta, req.Metadata)
	}
	if _, ok := meta["received"]; !ok {
		meta["received"] = time.Now().Format(time.RFC3339)
	}

	// Build the Loom Graph
	g, err := graph.New[*IngestionState]().
		WithName("finance-signal-processing").
		AddNode("classify", graph.NodeFunc(c.pipelineClassifyNode)).
		AddNode("extract", graph.NodeFunc(c.pipelineExtractNode)).
		AddNode("resolve", graph.NodeFunc(c.pipelineResolveNode)).
		AddNode("deduplicate", graph.NodeFunc(c.pipelineDeduplicateNode)).
		AddEdge(graph.START, "classify").
		AddConditionalEdge("classify", "extract", func(s *IngestionState) bool {
			return s.Classification != "UNKNOWN"
		}).
		AddConditionalEdge("classify", graph.END, func(s *IngestionState) bool {
			return s.Classification == "UNKNOWN"
		}).
		AddEdge("extract", "resolve").
		AddEdge("resolve", "deduplicate").
		AddEdge("deduplicate", graph.END).
		Build()

	if err != nil {
		return nil, fmt.Errorf("compile signal processing graph: %w", err)
	}

	// Execute graph synchronously
	snapshot, err := g.Execute(ctx, graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
		return &IngestionState{
			SpaceID:  spaceID,
			Request:  req,
			Metadata: meta,
		}
	}), nil)
	if err != nil {
		return nil, fmt.Errorf("execute signal processing graph: %w", err)
	}

	return snapshot.State, nil
}

// SignalSuggestion contains the processed AI suggestions and database match resolution for form prefilling.
type SignalSuggestion struct {
	Classification       string         `json:"classification"`
	Vendor               string         `json:"vendor"`
	Amount               int64          `json:"amount"`
	Currency             string         `json:"currency"`
	Date                 string         `json:"date"`
	CardLastFour         string         `json:"cardLastFour,omitempty"`
	SuggestedBudget      string         `json:"suggestedBudget,omitempty"`
	AccountID            *string        `json:"accountId,omitempty"`
	DestinationAccountID *string        `json:"destinationAccountId,omitempty"`
	BudgetID             *string        `json:"budgetId,omitempty"`
	PotentialDuplicateID *string        `json:"potentialDuplicateId,omitempty"`
	Metadata             map[string]any `json:"metadata,omitempty"`
}

// GetSignalSuggestions runs the signal pipeline without side-effects and returns prefill suggestions.
func (c *Coordinator) GetSignalSuggestions(ctx context.Context, spaceID string, req *IngestionRequest) (*SignalSuggestion, error) {
	state, err := c.ProcessSignalPipeline(ctx, spaceID, req)
	if err != nil {
		return nil, err
	}

	var destAccID *string
	if v, ok := state.Metadata["destination_account_id"].(string); ok && v != "" {
		destAccID = &v
	}

	return &SignalSuggestion{
		Classification:       state.Classification,
		Vendor:               state.Vendor,
		Amount:               state.Amount,
		Currency:             state.Currency,
		Date:                 state.Date,
		CardLastFour:         state.CardLastFour,
		SuggestedBudget:      state.SuggestedBudget,
		AccountID:            state.AccountID,
		DestinationAccountID: destAccID,
		BudgetID:             state.BudgetID,
		PotentialDuplicateID: state.PotentialDuplicateID,
		Metadata:             state.Metadata,
	}, nil
}

// 1. Classifier Node: Decides if document is INVOICE, RECEIPT, BANK_NOTIFICATION, SYSTEM_VERIFICATION, or UNKNOWN.
func (c *Coordinator) pipelineClassifyNode(ctx context.Context, state *IngestionState) (graph.Command[*IngestionState], error) {
	textContent := ""
	if state.Request != nil {
		textContent = state.Request.TextContent
	}
	bodyLower := strings.ToLower(textContent)

	subjectLower := ""
	senderLower := ""
	if state.Request != nil && state.Request.Metadata != nil {
		if subj, ok := state.Request.Metadata["subject"].(string); ok {
			subjectLower = strings.ToLower(subj)
		}
		if snd, ok := state.Request.Metadata["sender"].(string); ok {
			senderLower = strings.ToLower(snd)
		}
	}

	if strings.Contains(bodyLower, "forwarding confirmation") ||
		strings.Contains(subjectLower, "forwarding confirmation") ||
		strings.Contains(bodyLower, "verification code") ||
		strings.Contains(senderLower, "forwarding-noreply") ||
		strings.Contains(senderLower, "no-reply@microsoft.com") {
		return graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
			s.Classification = "SYSTEM_VERIFICATION"
			return s
		}), nil
	}

	cls, err := c.classifier.Classify(ctx, state.SpaceID, textContent)
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
	textContent := ""
	if state.Request != nil {
		textContent = state.Request.TextContent
	}

	if state.Classification == "SYSTEM_VERIFICATION" {
		return graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
			vendor := "Email Forwarding Verification"
			senderLower := ""
			if snd, ok := s.Metadata["sender"].(string); ok {
				senderLower = strings.ToLower(snd)
			}
			payloadLower := strings.ToLower(textContent)
			if strings.Contains(senderLower, "google") || strings.Contains(payloadLower, "google") {
				vendor = "Google Email Forwarding"
			} else if strings.Contains(senderLower, "microsoft") {
				vendor = "Microsoft Email Forwarding"
			}
			s.Vendor = vendor
			s.Amount = 0
			s.Currency = "USD"
			s.Date = time.Now().Format(time.RFC3339)
			s.Metadata["transaction_type"] = "SYSTEM_VERIFICATION"
			return s
		}), nil
	}

	// Fetch active budgets, accounts, scheduled payments, and recurring expenses to guide matching context
	page, err := c.financeService.ListBudgets(ctx, finance.SpaceID(state.SpaceID), &finance.ListBudgetsFilter{})
	if err != nil {
		return nil, fmt.Errorf("list budgets: %w", err)
	}
	budgets := page.Items

	accPage, err := c.financeService.ListAccounts(ctx, finance.SpaceID(state.SpaceID), &finance.ListAccountsFilter{PageSize: 1000})
	if err != nil {
		return nil, fmt.Errorf("list accounts: %w", err)
	}
	accounts := accPage.Items

	instPage, err := c.financeService.ListInstitutions(ctx, finance.SpaceID(state.SpaceID), &finance.ListInstitutionsFilter{PageSize: 1000})
	var institutions []*finance.Institution
	if err == nil {
		institutions = instPage.Items
	}

	spPage, err := c.financeService.ListScheduledTransactions(ctx, finance.SpaceID(state.SpaceID), &finance.ListScheduledTransactionsFilter{})
	if err != nil {
		return nil, fmt.Errorf("list scheduled transactions: %w", err)
	}
	payments := spPage.Items

	reePage, err := c.financeService.ListRecurringTransactions(ctx, finance.SpaceID(state.SpaceID), &finance.ListRecurringTransactionsFilter{})
	if err != nil {
		return nil, fmt.Errorf("list recurring transactions: %w", err)
	}
	expenses := reePage.Items

	statusActive := finance.BorrowingStatusActive
	borrowings, _, err := c.financeService.ListBorrowings(ctx, finance.SpaceID(state.SpaceID), &finance.ListBorrowingsFilter{
		Status: &statusActive,
	})
	if err != nil {
		// Log the error but don't fail ingestion if borrowings fail to query
		borrowings = nil
	}

	result, err := c.parser.Parse(ctx, state.SpaceID, textContent, IngestionContext{
		Budgets:               budgets,
		Accounts:              accounts,
		Institutions:          institutions,
		ScheduledTransactions: payments,
		RecurringTransactions: expenses,
		Borrowings:            borrowings,
		ReferenceDate:         time.Now(),
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
		s.Metadata["suggested_account_id"] = result.SourceAccountID
		s.Metadata["source_account_name"] = result.SourceAccountName
		s.Metadata["destination_account_id"] = result.DestAccountID
		s.Metadata["dest_account_name"] = result.DestAccountName
		s.Metadata["dest_account_last_four"] = result.DestAccountLastFour
		s.Metadata["suggested_borrowing_id"] = result.SuggestedBorrowing
		s.Metadata["transaction_type"] = result.TransactionType
		s.Metadata["suggested_transfer_leg"] = result.SuggestedTransferLeg
		s.Metadata["raw_agent_output"] = result.RawOutput
		return s
	}), nil
}

// 3. Resolve Node: Queries Saturn DB to match accounts, budgets, and categories.
func (c *Coordinator) pipelineResolveNode(ctx context.Context, state *IngestionState) (graph.Command[*IngestionState], error) {
	// 1. Resolve Source Account via unified financeService domain resolver
	srcAcc, err := c.financeService.ResolveAccount(ctx, finance.SpaceID(state.SpaceID), finance.ResolveAccountOpts{
		AccountID:   state.MetadataString("suggested_account_id"),
		AccountName: state.MetadataString("source_account_name"),
		LastFour:    state.CardLastFour,
		Currency:    state.Currency,
	})
	var accountID *string
	if err == nil && srcAcc != nil {
		accountID = new(string(srcAcc.ID))
	}

	// 2. Resolve Budget & Fallback to Budget Default Account
	var budgetID *string
	if state.SuggestedBudget != "" {
		if bID, err := finance.ParseBudgetID(state.SuggestedBudget); err == nil {
			if budget, err := c.financeService.GetBudget(ctx, finance.SpaceID(state.SpaceID), bID); err == nil && budget != nil && string(budget.SpaceID) == state.SpaceID {
				budgetID = new(string(budget.ID))
				if accountID == nil && budget.DefaultAccountID != nil {
					accountID = new(string(*budget.DefaultAccountID))
				}
			}
		} else if pageB, err := c.financeService.ListBudgets(ctx, finance.SpaceID(state.SpaceID), &finance.ListBudgetsFilter{PageSize: 1000}); err == nil {
			for _, b := range pageB.Items {
				if strings.EqualFold(b.Name, state.SuggestedBudget) {
					budgetID = new(string(b.ID))
					if accountID == nil && b.DefaultAccountID != nil {
						accountID = new(string(*b.DefaultAccountID))
					}
					break
				}
			}
		}
	}

	// 3. Resolve Destination Account (for Transfers) via unified financeService domain resolver
	destAcc, err := c.financeService.ResolveAccount(ctx, finance.SpaceID(state.SpaceID), finance.ResolveAccountOpts{
		AccountID:   state.MetadataString("destination_account_id"),
		AccountName: state.MetadataString("dest_account_name"),
		LastFour:    state.MetadataString("dest_account_last_four"),
		Currency:    state.Currency,
	})
	if err == nil && destAcc != nil {
		state.Metadata["destination_account_id"] = string(destAcc.ID)
	}

	return graph.Update[*IngestionState](func(s *IngestionState) *IngestionState {
		s.AccountID = accountID
		s.BudgetID = budgetID
		return s
	}), nil
}

// 4. Deduplicate Node: Audits recently logged transactions to flag double-entries.
func (c *Coordinator) pipelineDeduplicateNode(ctx context.Context, state *IngestionState) (graph.Command[*IngestionState], error) {
	var parsedDate time.Time
	if state.Date != "" {
		if t, err := time.Parse(time.RFC3339, state.Date); err == nil {
			parsedDate = t
		} else if t, err := time.Parse("2006-01-02", state.Date); err == nil {
			parsedDate = t
		}
	}
	if parsedDate.IsZero() {
		parsedDate = time.Now()
	}

	minAmt := int64(float64(state.Amount) * dedupAmountMinFactor)
	maxAmt := int64(float64(state.Amount) * dedupAmountMaxFactor)
	startDate := parsedDate.AddDate(0, 0, -dedupDateRangeDays)
	endDate := parsedDate.AddDate(0, 0, dedupDateRangeDays)

	var searchQuery *string
	if state.Vendor != "" {
		searchQuery = &state.Vendor
	}

	filter := &finance.TransactionFilter{
		PageSize:  dedupMaxCandidates,
		MinAmount: &minAmt,
		MaxAmount: &maxAmt,
		StartDate: &startDate,
		EndDate:   &endDate,
	}
	if searchQuery != nil {
		filter.SearchQuery = searchQuery
	}

	page, err := c.financeService.ListTransactions(ctx, finance.SpaceID(state.SpaceID), filter)
	if err != nil {
		return nil, fmt.Errorf("list transactions: %w", err)
	}
	transactions := page.Items

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
