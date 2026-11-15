package financeapp

import (
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

const (
	// SystemFlowInboxIngestion is the built-in system flow key for financial inbox staging.
	SystemFlowInboxIngestion = "system.finance.inbox_ingestion"
	// SystemFlowTransactionSuggestions is the built-in system flow key for form prefill suggestions.
	SystemFlowTransactionSuggestions = "system.finance.transaction_suggestions"
	// SystemFlowStatementIngestion is the built-in system flow key for bank/card statement parsing & drafting.
	SystemFlowStatementIngestion = "system.finance.statement_ingestion"
)

func registerFinanceSystemFlows(reg *workflow.Registry) {
	reg.RegisterSystemFlow(workflow.SystemFlowBlueprint{
		SystemKey: SystemFlowInboxIngestion,
		Build:     buildInboxIngestionFlow,
	})
	reg.RegisterSystemFlow(workflow.SystemFlowBlueprint{
		SystemKey: SystemFlowTransactionSuggestions,
		Build:     buildTransactionSuggestionsFlow,
	})
	reg.RegisterSystemFlow(workflow.SystemFlowBlueprint{
		SystemKey: SystemFlowStatementIngestion,
		Build:     buildStatementIngestionFlow,
	})
}

type inboxIngestionInput struct {
	Text           string                 `json:"text"`
	RawPayload     string                 `json:"raw_payload,omitempty"`
	IdempotencyKey string                 `json:"idempotency_key,omitempty"`
	Documents      []workflow.ArtifactRef `json:"documents,omitempty"`
}

type transactionSuggestionsInput struct {
	Text      string                 `json:"text"`
	Documents []workflow.ArtifactRef `json:"documents,omitempty"`
}

type statementIngestionInput struct {
	Document        string `json:"document"`
	Filename        string `json:"filename,omitempty"`
	ContentType     string `json:"content_type,omitempty"`
	Password        string `json:"password,omitempty"`
	TargetAccountID string `json:"target_account_id,omitempty"`
	DryRun          bool   `json:"dry_run,omitempty"`
}

type hyperionClassification struct {
	Category   string  `json:"category" jsonschema:"One of: invoice, receipt, bank_notification, ignore"`
	Confidence float64 `json:"confidence"`
	Reason     string  `json:"reason"`
}

type hyperionExtraction struct {
	TransactionType      string  `json:"transaction_type"`
	Vendor               string  `json:"vendor"`
	Amount               float64 `json:"amount"`
	Currency             string  `json:"currency"`
	Date                 string  `json:"date"`
	CardLastFour         string  `json:"card_last_four,omitempty"`
	SourceAccountID      string  `json:"source_account_id,omitempty"`
	SourceAccountName    string  `json:"source_account_name,omitempty"`
	DestinationAccountID string  `json:"destination_account_id,omitempty"`
	BudgetID             string  `json:"budget_id,omitempty"`
	BudgetName           string  `json:"budget_name,omitempty"`
	BorrowingID          string  `json:"borrowing_id,omitempty"`
	TransferLeg          string  `json:"transfer_leg,omitempty"`
}

type hyperionDedupResult struct {
	IsDuplicate            bool   `json:"is_duplicate"`
	DuplicateTransactionID string `json:"duplicate_transaction_id,omitempty"`
	Reason                 string `json:"reason"`
}

type janusParsedLine struct {
	DateStr     string  `json:"date_str"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	Reference   string  `json:"reference,omitempty"`
}

type janusParsedSection struct {
	Currency           string            `json:"currency"`
	CardLastFour       string            `json:"card_last_four,omitempty"`
	SuggestedAccountID string            `json:"suggested_account_id,omitempty"`
	StartingBalance    float64           `json:"starting_balance"`
	EndingBalance      float64           `json:"ending_balance"`
	TotalCredits       float64           `json:"total_credits,omitempty"`
	TotalDebits        float64           `json:"total_debits,omitempty"`
	Lines              []janusParsedLine `json:"lines"`
}

type janusParsedStatement struct {
	InstitutionName string               `json:"institution_name,omitempty"`
	CardLastFour    string               `json:"card_last_four,omitempty"`
	StatementDate   string               `json:"statement_date"`
	Sections        []janusParsedSection `json:"sections"`
}

type resolvedSignalTemplate struct {
	Classification       string `json:"classification"`
	TransactionType      string `json:"transaction_type"`
	Vendor               string `json:"vendor"`
	AmountCents          string `json:"amount_cents"`
	Currency             string `json:"currency"`
	Date                 string `json:"date"`
	CardLastFour         string `json:"card_last_four"`
	AccountID            string `json:"account_id"`
	DestinationAccountID string `json:"destination_account_id"`
	BudgetID             string `json:"budget_id"`
	BorrowingID          string `json:"borrowing_id"`
	TransferLeg          string `json:"transfer_leg"`
}

type inboxMetadataTemplate struct {
	TransactionType string `json:"transaction_type"`
	CardLastFour    string `json:"card_last_four"`
	TransferLeg     string `json:"transfer_leg"`
}

type createInboxItemTemplate struct {
	IdempotencyKey       string                `json:"idempotency_key"`
	DocType              string                `json:"doc_type"`
	Vendor               string                `json:"vendor"`
	AmountCents          string                `json:"amount_cents"`
	Currency             string                `json:"currency"`
	Date                 string                `json:"date"`
	AccountID            string                `json:"account_id"`
	DestinationAccountID string                `json:"destination_account_id"`
	BudgetID             string                `json:"budget_id"`
	BorrowingID          string                `json:"borrowing_id"`
	PotentialDuplicateID string                `json:"potential_duplicate_id"`
	RawPayload           string                `json:"raw_payload"`
	Metadata             inboxMetadataTemplate `json:"metadata"`
}

type importStatementDraftTemplate struct {
	Filename        string `json:"filename"`
	StatementDate   string `json:"statement_date"`
	InstitutionName string `json:"institution_name"`
	TargetAccountID string `json:"target_account_id"`
	CardLastFour    string `json:"card_last_four"`
	DryRun          string `json:"dry_run"`
	Sections        string `json:"sections"`
}

type mailTriggerMapping struct {
	Text           string `json:"text"`
	RawPayload     string `json:"raw_payload"`
	IdempotencyKey string `json:"idempotency_key"`
	Documents      string `json:"documents"`
}

type suggestionsOutputTemplate struct {
	Classification       string `json:"classification"`
	Vendor               string `json:"vendor"`
	AmountCents          string `json:"amount_cents"`
	Currency             string `json:"currency"`
	Date                 string `json:"date"`
	CardLastFour         string `json:"card_last_four"`
	AccountID            string `json:"account_id"`
	DestinationAccountID string `json:"destination_account_id"`
	BudgetID             string `json:"budget_id"`
	PotentialDuplicateID string `json:"potential_duplicate_id"`
}

type recentTransactionsTemplate struct {
	NearAmountCents string  `json:"near_amount_cents"`
	TolerancePct    float64 `json:"tolerance_pct"`
	NearDate        string  `json:"near_date"`
	WindowDays      int     `json:"window_days"`
	Limit           int     `json:"limit"`
}

type unreadableStatementOutput struct {
	NeedsPassword string `json:"needs_password"`
	Errors        string `json:"errors"`
}

func sharedClassificationAndExtractionSteps() []workflow.StepNode {
	return []workflow.StepNode{
		workflow.LLMStep(workflow.LLMStepConfig{
			ID:   "classify",
			Name: "Classify Financial Signal",
			System: `You are Hyperion, the Saturn Ledger Ingestion Agent. Classify the incoming email, receipt, or alert into:
- "invoice": An outstanding bill, invoice, or request for future payment (if balance is $0 or already paid/charged, classify as "receipt" or "bank_notification").
- "receipt": A purchase confirmation or receipt issued by a merchant/vendor.
- "bank_notification": A swipe confirmation, transfer alert, deposit receipt, or bank notice.
- "ignore": Verification codes, spam, marketing, or non-financial content.`,
			Prompt:       "Classify this document:\n\n{{ input.text }}",
			OutputSchema: workflow.SchemaFor[hyperionClassification](),
			Documents:    "{{ input.?documents.orValue([]) }}",
		}),
		workflow.FilterStep(workflow.FilterStepConfig{
			ID:        "only_financial",
			Name:      "Filter Financial Signals",
			Condition: "steps.classify.category != 'ignore'",
			Reason:    "Signal is not a financial invoice, receipt, or bank notification",
		}),
		workflow.LLMStep(workflow.LLMStepConfig{
			ID:   "extract_tx",
			Name: "Extract Transaction Details",
			Sources: map[string]workflow.SourceBinding{
				"accounts":            workflow.Source(workflow.SourceConfig[ListAccountsParams]{Loader: "finance.accounts"}),
				"budgets":             workflow.Source(workflow.SourceConfig[ListBudgetsParams]{Loader: "finance.budgets", Params: ListBudgetsParams{Status: "active"}}),
				"scheduled_payments":  workflow.Source(workflow.SourceConfig[ListScheduledPaymentsParams]{Loader: "finance.scheduled_payments", Params: ListScheduledPaymentsParams{Status: "pending"}}),
				"recurring_templates": workflow.Source(workflow.SourceConfig[ListRecurringTemplatesParams]{Loader: "finance.recurring_templates", Params: ListRecurringTemplatesParams{Status: "active"}}),
				"borrowings":          workflow.Source(workflow.SourceConfig[ListBorrowingsParams]{Loader: "finance.borrowings", Params: ListBorrowingsParams{Status: "active"}}),
			},
			System: `You are Hyperion, the Saturn Ledger Ingestion Agent. Extract structured transaction details:
- transaction_type: "EXPENSE", "INCOME", "TRANSFER", or "REFUND".
- currency: ISO-4217 code (e.g. USD, DOP, EUR).
- amount: Positive decimal amount.
- date: ISO-8601 date (YYYY-MM-DD).
- Match source_account_id / destination_account_id from accounts (preferring currency match when card_last_four collides), budget_id from budgets, and borrowing_id from borrowings when applicable.`,
			Prompt:       "Reference time (UTC): {{ string(run.now) }}\nAccounts: {{ toJSON(sources.accounts) }}\nBudgets: {{ toJSON(sources.budgets) }}\nScheduled Payments: {{ toJSON(sources.scheduled_payments) }}\nRecurring Templates: {{ toJSON(sources.recurring_templates) }}\nBorrowings: {{ toJSON(sources.borrowings) }}\n\nDocument:\n{{ input.text }}",
			OutputSchema: workflow.SchemaFor[hyperionExtraction](),
			Documents:    "{{ input.?documents.orValue([]) }}",
		}),
		workflow.TransformStep(workflow.TransformStepConfig{
			ID:   "resolve",
			Name: "Resolve Accounts & Budget",
			Sources: map[string]workflow.SourceBinding{
				"source_account": workflow.Source(workflow.SourceConfig[ResolveAccountParams]{
					Loader: "finance.account",
					Params: ResolveAccountParams{
						ID:       "{{ steps.extract_tx.?source_account_id.orValue('') }}",
						Name:     "{{ steps.extract_tx.?source_account_name.orValue('') }}",
						LastFour: "{{ steps.extract_tx.?card_last_four.orValue('') }}",
						Currency: "{{ steps.extract_tx.currency }}",
					},
				}),
				"destination_account": workflow.Source(workflow.SourceConfig[ResolveAccountParams]{
					Loader: "finance.account",
					Params: ResolveAccountParams{
						ID:       "{{ steps.extract_tx.?destination_account_id.orValue('') }}",
						Currency: "{{ steps.extract_tx.currency }}",
					},
				}),
				"budget": workflow.Source(workflow.SourceConfig[ResolveBudgetParams]{
					Loader: "finance.budget",
					Params: ResolveBudgetParams{
						ID:   "{{ steps.extract_tx.?budget_id.orValue('') }}",
						Name: "{{ steps.extract_tx.?budget_name.orValue('') }}",
					},
				}),
			},
			Inputs: resolvedSignalTemplate{
				Classification:       "{{ steps.classify.category }}",
				TransactionType:      "{{ steps.extract_tx.transaction_type }}",
				Vendor:               "{{ steps.extract_tx.vendor }}",
				AmountCents:          "{{ toCents(steps.extract_tx.amount) }}",
				Currency:             "{{ steps.extract_tx.currency }}",
				Date:                 "{{ steps.extract_tx.date }}",
				CardLastFour:         "{{ steps.extract_tx.?card_last_four.orValue('') }}",
				AccountID:            "{{ sources.source_account != null ? sources.source_account.id : null }}",
				DestinationAccountID: "{{ sources.destination_account != null ? sources.destination_account.id : null }}",
				BudgetID:             "{{ sources.budget != null ? sources.budget.id : null }}",
				BorrowingID:          "{{ steps.extract_tx.?borrowing_id.orValue(null) }}",
				TransferLeg:          "{{ steps.extract_tx.?transfer_leg.orValue('') }}",
			},
		}),
		workflow.LLMStep(workflow.LLMStepConfig{
			ID:      "dedup_check",
			Name:    "Semantic Deduplication Check",
			OnError: workflow.OnErrorContinue,
			Sources: map[string]workflow.SourceBinding{
				"recent_transactions": workflow.Source(workflow.SourceConfig[recentTransactionsTemplate]{
					Loader: "finance.transactions",
					Params: recentTransactionsTemplate{
						NearAmountCents: "{{ steps.resolve.amount_cents }}",
						TolerancePct:    0.30,
						NearDate:        "{{ steps.resolve.date }}",
						WindowDays:      10,
						Limit:           10,
					},
				}),
			},
			System:       "You are Hyperion performing semantic deduplication. Compare the extracted transaction against recent_transactions and identify any duplicate transaction ID.",
			Prompt:       "Extracted transaction: {{ toJSON(steps.resolve) }}\nRecent transactions: {{ toJSON(sources.recent_transactions) }}",
			OutputSchema: workflow.SchemaFor[hyperionDedupResult](),
		}),
	}
}

func buildInboxIngestionFlow(spaceID string) (*workflow.Flow, []workflow.Trigger) {
	steps := append(sharedClassificationAndExtractionSteps(), workflow.ActionStep(workflow.ActionStepConfig[createInboxItemTemplate]{
		ID:   "stage_inbox",
		Name: "Stage Finance Inbox Item",
		Type: "finance.create_inbox_item",
		Inputs: createInboxItemTemplate{
			IdempotencyKey:       "{{ input.?idempotency_key.orValue('') }}",
			DocType:              "{{ steps.resolve.classification }}",
			Vendor:               "{{ steps.resolve.vendor }}",
			AmountCents:          "{{ steps.resolve.amount_cents }}",
			Currency:             "{{ steps.resolve.currency }}",
			Date:                 "{{ steps.resolve.date }}",
			AccountID:            "{{ steps.resolve.account_id }}",
			DestinationAccountID: "{{ steps.resolve.destination_account_id }}",
			BudgetID:             "{{ steps.resolve.budget_id }}",
			BorrowingID:          "{{ steps.resolve.borrowing_id }}",
			PotentialDuplicateID: "{{ steps.dedup_check != null ? steps.dedup_check.?duplicate_transaction_id.orValue('') : '' }}",
			RawPayload:           "{{ input.?raw_payload.orValue(input.text) }}",
			Metadata: inboxMetadataTemplate{
				TransactionType: "{{ steps.resolve.transaction_type }}",
				CardLastFour:    "{{ steps.resolve.card_last_four }}",
				TransferLeg:     "{{ steps.resolve.transfer_leg }}",
			},
		},
	}))

	flow := &workflow.Flow{
		SpaceID:     spaceID,
		SystemKey:   new(SystemFlowInboxIngestion),
		IsSystem:    true,
		IsEnabled:   true,
		Name:        "Finance Inbox Ingestion",
		Description: "Classifies receipts, invoices, and bank alerts, resolves workspace accounts/budgets, checks duplicates, and stages finance inbox items.",
		InputSchema: workflow.SchemaFor[inboxIngestionInput](),
		Steps:       steps,
	}

	triggers := []workflow.Trigger{
		{
			SpaceID:   spaceID,
			Name:      "Inbound Email Sync",
			Type:      workflow.TriggerEvent,
			IsEnabled: true,
			Config: workflow.TriggerConfig{
				Topic:  new("mail.message.received"),
				Filter: new("trigger.data.message.body_plain != '' || size(trigger.data.message.attachments) > 0"),
				InputMapping: workflow.StructToMap(mailTriggerMapping{
					Text:           "{{ trigger.data.message.subject + '\\n\\n' + trigger.data.message.body_plain }}",
					RawPayload:     "{{ trigger.data.message.body_plain }}",
					IdempotencyKey: "{{ 'mail:' + trigger.data.message.id }}",
					Documents:      "{{ trigger.data.message.attachments.map(a, {'ref': 'mail://' + trigger.data.message.id + '/' + a.id, 'filename': a.filename, 'content_type': a.content_type}) }}",
				}),
			},
		},
		{
			SpaceID:   spaceID,
			Name:      "Direct Signal Webhook",
			Type:      workflow.TriggerWebhook,
			IsEnabled: true,
		},
	}

	return flow, triggers
}

func buildTransactionSuggestionsFlow(spaceID string) (*workflow.Flow, []workflow.Trigger) {
	steps := append(sharedClassificationAndExtractionSteps(), workflow.OutputStep(workflow.OutputStepConfig{
		ID:   "return_suggestions",
		Name: "Return Form Prefill Suggestions",
		Value: suggestionsOutputTemplate{
			Classification:       "{{ steps.resolve.classification }}",
			Vendor:               "{{ steps.resolve.vendor }}",
			AmountCents:          "{{ steps.resolve.amount_cents }}",
			Currency:             "{{ steps.resolve.currency }}",
			Date:                 "{{ steps.resolve.date }}",
			CardLastFour:         "{{ steps.resolve.card_last_four }}",
			AccountID:            "{{ steps.resolve.account_id }}",
			DestinationAccountID: "{{ steps.resolve.destination_account_id }}",
			BudgetID:             "{{ steps.resolve.budget_id }}",
			PotentialDuplicateID: "{{ steps.dedup_check != null ? steps.dedup_check.?duplicate_transaction_id.orValue('') : '' }}",
		},
	}))

	flow := &workflow.Flow{
		SpaceID:     spaceID,
		SystemKey:   new(SystemFlowTransactionSuggestions),
		IsSystem:    true,
		IsEnabled:   true,
		Name:        "Transaction Form Suggestions",
		Description: "Side-effect-free callable flow returning transaction prefill suggestions from raw text or uploaded receipts.",
		InputSchema: workflow.SchemaFor[transactionSuggestionsInput](),
		Steps:       steps,
	}

	triggers := []workflow.Trigger{
		{
			SpaceID:   spaceID,
			Name:      "Callable Form Prefill",
			Type:      workflow.TriggerManual,
			IsEnabled: true,
		},
	}

	return flow, triggers
}

func buildStatementIngestionFlow(spaceID string) (*workflow.Flow, []workflow.Trigger) {
	steps := []workflow.StepNode{
		workflow.DocumentExtractTextStep(workflow.DocumentExtractTextStepConfig{
			ID:          "extract_doc",
			Name:        "Extract Statement Text",
			ArtifactRef: "{{ input.document }}",
			Filename:    "{{ input.?filename.orValue('') }}",
			ContentType: "{{ input.?content_type.orValue('') }}",
			Passwords:   "{{ [input.?password.orValue('')] }}",
		}),
		workflow.SwitchStep(workflow.SwitchStepConfig{
			ID:   "guard_readable",
			Name: "Guard Readable Statement",
			Cases: []workflow.SwitchCase{
				{
					Name:      "unreadable",
					Condition: "steps.extract_doc.needs_password || steps.extract_doc.text == ''",
					Steps: []workflow.StepNode{
						workflow.OutputStep(workflow.OutputStepConfig{
							ID:   "return_unreadable",
							Name: "Return Unreadable / Password Required",
							Value: unreadableStatementOutput{
								NeedsPassword: "{{ steps.extract_doc.needs_password }}",
								Errors:        "{{ [coalesce(steps.extract_doc.?error.orValue(''), 'document contains no readable text')] }}",
							},
						}),
					},
				},
			},
		}),
		workflow.LLMStep(workflow.LLMStepConfig{
			ID:   "parse_sections",
			Name: "Parse Multi-Currency Statement Sections",
			Sources: map[string]workflow.SourceBinding{
				"accounts": workflow.Source(workflow.SourceConfig[ListAccountsParams]{Loader: "finance.accounts"}),
			},
			System: `You are Janus, the Saturn Statement & Reconciliation Audit Agent.
Analyze bank and credit card statement text and extract structured multi-currency ledger sections, balances, and lines:
1. Multi-Currency Ledgers: Separate distinct currencies into independent entries in sections; never combine currencies; ignore empty boilerplate sections with 0 lines and 0 balances.
2. Transaction Lines: date_str as YYYY-MM-DD; negative (-) for charges/purchases/debits/fees, positive (+) for payments/credits/deposits/refunds (normalize credit card purchases to negative and payments to positive).
3. Match each section to an account from accounts using last_four and currency into suggested_account_id.`,
			Prompt:       "Accounts:\n{{ toJSON(sources.accounts) }}\n\nStatement Text:\n{{ steps.extract_doc.text }}",
			OutputSchema: workflow.SchemaFor[janusParsedStatement](),
		}),
		workflow.ActionStep(workflow.ActionStepConfig[importStatementDraftTemplate]{
			ID:   "stage_statements",
			Name: "Validate & Stage Statement Drafts",
			Type: "finance.import_statement_draft",
			Inputs: importStatementDraftTemplate{
				Filename:        "{{ input.?filename.orValue('') }}",
				StatementDate:   "{{ steps.parse_sections.statement_date }}",
				InstitutionName: "{{ steps.parse_sections.?institution_name.orValue('') }}",
				TargetAccountID: "{{ input.?target_account_id.orValue('') }}",
				CardLastFour:    "{{ steps.parse_sections.?card_last_four.orValue('') }}",
				DryRun:          "{{ input.?dry_run.orValue(false) }}",
				Sections:        "{{ steps.parse_sections.sections }}",
			},
		}),
		workflow.OutputStep(workflow.OutputStepConfig{
			ID:    "return_result",
			Name:  "Return Statement Ingestion Result",
			Value: "{{ steps.stage_statements }}",
		}),
	}

	flow := &workflow.Flow{
		SpaceID:     spaceID,
		SystemKey:   new(SystemFlowStatementIngestion),
		IsSystem:    true,
		IsEnabled:   true,
		Name:        "Statement Ingestion",
		Description: "Decrypts and extracts PDF/CSV bank statements, parses multi-currency ledgers, validates balance math, and stages statement drafts.",
		InputSchema: workflow.SchemaFor[statementIngestionInput](),
		Steps:       steps,
	}

	triggers := []workflow.Trigger{
		{
			SpaceID:   spaceID,
			Name:      "Statement Upload",
			Type:      workflow.TriggerManual,
			IsEnabled: true,
		},
	}

	return flow, triggers
}
