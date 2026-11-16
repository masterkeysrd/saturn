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

type signalClassification struct {
	Category   string  `json:"category" jsonschema:"One of: invoice, receipt, bank_notification, ignore"`
	Confidence float64 `json:"confidence"`
	Reason     string  `json:"reason"`
}

type signalExtraction struct {
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

type signalDedupResult struct {
	IsDuplicate            bool   `json:"is_duplicate"`
	DuplicateTransactionID string `json:"duplicate_transaction_id,omitempty"`
	Reason                 string `json:"reason"`
}

type statementLineDraft struct {
	DateStr     string  `json:"date_str"`
	Description string  `json:"description"`
	Amount      float64 `json:"amount"`
	Reference   string  `json:"reference,omitempty"`
}

type statementSectionDraft struct {
	Currency           string               `json:"currency"`
	CardLastFour       string               `json:"card_last_four,omitempty"`
	SuggestedAccountID string               `json:"suggested_account_id,omitempty"`
	StartingBalance    float64              `json:"starting_balance"`
	EndingBalance      float64              `json:"ending_balance"`
	TotalCredits       float64              `json:"total_credits,omitempty"`
	TotalDebits        float64              `json:"total_debits,omitempty"`
	Lines              []statementLineDraft `json:"lines"`
}

type statementExtraction struct {
	InstitutionName string                  `json:"institution_name,omitempty"`
	CardLastFour    string                  `json:"card_last_four,omitempty"`
	StatementDate   string                  `json:"statement_date"`
	Sections        []statementSectionDraft `json:"sections"`
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
			System: `You are Saturn's financial ledger ingestion classifier. Analyze the incoming email, receipt, or alert text and attached documents, then classify into one of:
- "invoice": An outstanding bill, invoice, or request for future payment.
  * Note: If the document indicates the balance is $0, or is marked as "PAID", "CONFIRMED", or shows a card/account was already charged, classify it as "receipt" or "bank_notification".
- "receipt": A transaction confirmation, purchase confirmation, or receipt issued directly by a merchant or vendor (e.g. Apple Store, Amazon, Uber, restaurants, utility receipts).
- "bank_notification": An alert, swipe confirmation, transfer confirmation, deposit receipt, or bank notice issued directly by a bank or financial institution (e.g. Banco BHD alerts, credit card swipes, wire transfers).
- "ignore": Verification codes, OTPs, spam, marketing, or non-financial content.`,
			Prompt:       "Classify this document:\n\n{{ input.text }}",
			OutputSchema: workflow.SchemaFor[signalClassification](),
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
			System: `You are Saturn's financial transaction extractor. Analyze unstructured bank alerts, receipt notifications, invoices, and attached documents to extract structured transaction details.

EXTRACTION RULES:
1. transaction_type:
   - "EXPENSE": Cash out, card charge, online purchase, debit, or payable bill/invoice.
   - "INCOME": Deposit, salary, or transfer received from a third party.
   - "TRANSFER": Movement between owned accounts (e.g. checking to credit card payment, savings transfer).
   - "REFUND": Card reversals, chargebacks, or merchant returns.
2. currency: Normalize symbols into standard ISO-4217 codes (e.g. $ -> USD, RD$ -> DOP, € -> EUR).
3. amount: Positive decimal amount (never negative).
4. date: ISO-8601 date (YYYY-MM-DD), resolving relative dates against Reference time (UTC).
5. budget_id / budget_name: Match a category ONLY from the active budgets list based on semantic meaning and return its exact "id" (e.g. "bgt_..."). If there is no clear semantic match, leave budget_id empty/null.
6. Account matching (source_account_id / destination_account_id / card_last_four):
   - Match accounts ONLY from the active accounts list (by id, name, last_four, or currency). When multiple accounts share the same name or card last_four (e.g. dual-currency credit cards), prioritize the account whose currency matches the transaction currency.
   - source_account_id: The card or account that initiated an outflow/charge.
   - destination_account_id: The account that received an inflow (especially for TRANSFER or INCOME).
7. borrowing_id: Match ONLY from active borrowings (direction BORROWED = payable liability, LENT = receivable asset) when the transaction represents a loan repayment or disbursement with that counterparty; otherwise leave empty/null.
8. transfer_leg (CRITICAL for TRANSFER transactions):
   - "SOURCE": The document is a debit confirmation, withdrawal alert, or card charge from the sending account.
   - "DESTINATION": The document is a deposit confirmation, credit alert, or incoming wire receipt on the receiving account.
   - Leave empty/null when transaction_type is not "TRANSFER".

Context notes:
- scheduled_payments are concrete pending instances generated from recurring_templates (cadence rules).`,
			Prompt:       "Reference time (UTC): {{ string(run.now) }}\nAccounts: {{ toJSON(sources.accounts) }}\nBudgets: {{ toJSON(sources.budgets) }}\nScheduled Payments: {{ toJSON(sources.scheduled_payments) }}\nRecurring Templates: {{ toJSON(sources.recurring_templates) }}\nBorrowings: {{ toJSON(sources.borrowings) }}\n\nDocument:\n{{ input.text }}",
			OutputSchema: workflow.SchemaFor[signalExtraction](),
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
			System: `You are Saturn's semantic deduplication checker. Compare the newly extracted transaction against recent_transactions to determine whether this document represents a duplicate entry (for example, a credit card alert matching a merchant receipt, or an invoice already recorded).

CRITICAL:
- If a duplicate is found, set is_duplicate to true and you MUST populate duplicate_transaction_id with the exact transaction "id" (e.g. "txn_...") from recent_transactions — never only mention the ID in reason.
- If no duplicate is found, set is_duplicate to false and leave duplicate_transaction_id empty/null.`,
			Prompt:       "Extracted transaction: {{ toJSON(steps.resolve) }}\nRecent transactions: {{ toJSON(sources.recent_transactions) }}",
			OutputSchema: workflow.SchemaFor[signalDedupResult](),
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
			System: `You are Saturn's Statement & Reconciliation Audit Parser. Analyze bank and credit card statement text and extract structured metadata, multi-currency ledger sections, balances, and transaction lines.

CORE EXTRACTION RULES:
1. Multi-Currency Ledgers (CRITICAL):
   - Many banks (e.g., in the Dominican Republic, Mexico, and internationally) issue credit cards or accounts with independent currency sections (e.g. DOP or MXN plus USD).
   - Separate distinct currencies into independent entries in sections; NEVER combine transactions or balances from different currencies into one section.
   - Each section must extract its own currency, card_last_four, starting_balance, ending_balance, total_credits, total_debits, and lines.
   - IGNORE EMPTY BOILERPLATE SECTIONS: Do not create a section for informational or installment tables (e.g. "Installment Credit Line DOP 0.00 0.00 0.00") that have 0 transactions and 0 balances.
2. Balances & Summaries:
   - starting_balance: Previous balance / Saldo anterior (decimal number, e.g. 1500.00).
   - ending_balance: Current statement balance / Saldo al corte / New balance (decimal number, e.g. 2350.00).
   - Extract total_credits and total_debits if listed in the summary.
3. Transaction Lines:
   - date_str: ISO-8601 YYYY-MM-DD. If the year is omitted on a line, infer it from statement_date.
   - description: Clean merchant name or narrative from the line.
   - amount: Signed decimal number — negative (-) for debits, purchases, charges, withdrawals, and bank fees; positive (+) for credits, payments toward the card, deposits, and refunds.
   - CRITICAL CREDIT CARD SIGN RULE: Even if the statement prints credit card charges as positive numbers (or in a 'Debits'/'Charges' column without minus signs) and payments/credits as negative or suffixed with 'CR', you MUST normalize them: all purchases/charges MUST be negative (-), and all card payments/credits MUST be positive (+).
   - reference: Optional reference number, check number, auth code, or bank transaction ID.
4. Institution & Account Matching:
   - Extract institution_name, card_last_four (primary 4 digits), and statement_date (YYYY-MM-DD).
   - Match each section to an account from accounts using last_four and currency into suggested_account_id; leave empty/null if no match.`,
			Prompt:       "Accounts:\n{{ toJSON(sources.accounts) }}\n\nStatement Text:\n{{ steps.extract_doc.text }}",
			OutputSchema: workflow.SchemaFor[statementExtraction](),
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
