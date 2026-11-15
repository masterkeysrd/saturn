package financeapp

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"maps"
	"math"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

// CreateInboxItemInputs defines inputs for the finance.create_inbox_item action step.
type CreateInboxItemInputs struct {
	IdempotencyKey       string         `json:"idempotency_key,omitempty" jsonschema:"Optional deduplication key"`
	DocType              string         `json:"doc_type" jsonschema:"Signal category (invoice, receipt, bank_notification)"`
	Vendor               string         `json:"vendor" jsonschema:"Merchant or counterparty name"`
	AmountCents          int64          `json:"amount_cents" jsonschema:"Transaction amount in minor units (cents)"`
	Currency             string         `json:"currency" jsonschema:"ISO-4217 currency code"`
	Date                 string         `json:"date" jsonschema:"Transaction date (YYYY-MM-DD)"`
	AccountID            string         `json:"account_id,omitempty" jsonschema:"Optional source account ID"`
	DestinationAccountID string         `json:"destination_account_id,omitempty" jsonschema:"Optional destination account ID for transfers"`
	BudgetID             string         `json:"budget_id,omitempty" jsonschema:"Optional suggested budget ID"`
	BorrowingID          string         `json:"borrowing_id,omitempty" jsonschema:"Optional linked borrowing ID"`
	PotentialDuplicateID string         `json:"potential_duplicate_id,omitempty" jsonschema:"Optional existing transaction ID flagged as potential duplicate"`
	RawPayload           string         `json:"raw_payload,omitempty" jsonschema:"Raw source text payload"`
	Metadata             map[string]any `json:"metadata,omitempty" jsonschema:"Additional metadata key-value pairs"`
}

// CreateInboxItemOutput defines outputs for finance.create_inbox_item.
type CreateInboxItemOutput struct {
	InboxItemID  string `json:"inbox_item_id"`
	Deduplicated bool   `json:"deduplicated"`
}

// StatementLineInput represents a single parsed transaction row in a statement section.
type StatementLineInput struct {
	DateStr     string   `json:"date_str,omitempty"`
	Date        string   `json:"date,omitempty"`
	Description string   `json:"description"`
	AmountCents *int64   `json:"amount_cents,omitempty"`
	Amount      *float64 `json:"amount,omitempty"`
	Reference   string   `json:"reference,omitempty"`
}

// StatementSectionInput represents one single-currency ledger section extracted from a statement.
type StatementSectionInput struct {
	Currency             string               `json:"currency"`
	CardLastFour         string               `json:"card_last_four,omitempty"`
	SuggestedAccountID   string               `json:"suggested_account_id,omitempty"`
	StartingBalanceCents *int64               `json:"starting_balance_cents,omitempty"`
	StartingBalance      *float64             `json:"starting_balance,omitempty"`
	EndingBalanceCents   *int64               `json:"ending_balance_cents,omitempty"`
	EndingBalance        *float64             `json:"ending_balance,omitempty"`
	TotalCredits         *float64             `json:"total_credits,omitempty"`
	TotalDebits          *float64             `json:"total_debits,omitempty"`
	Lines                []StatementLineInput `json:"lines"`
}

// ImportStatementDraftInputs defines inputs for the finance.import_statement_draft action step.
type ImportStatementDraftInputs struct {
	Filename        string                  `json:"filename,omitempty"`
	StatementDate   string                  `json:"statement_date,omitempty"`
	InstitutionName string                  `json:"institution_name,omitempty"`
	TargetAccountID string                  `json:"target_account_id,omitempty"`
	CardLastFour    string                  `json:"card_last_four,omitempty"`
	DryRun          bool                    `json:"dry_run,omitempty"`
	Sections        []StatementSectionInput `json:"sections"`
}

// CreatedStatementSummary describes a persisted statement draft.
type CreatedStatementSummary struct {
	ID                       string `json:"id"`
	AccountID                string `json:"account_id"`
	Currency                 string `json:"currency"`
	Status                   string `json:"status"`
	StatementDate            string `json:"statement_date"`
	StatementStartingBalance int64  `json:"statement_starting_balance"`
	StatementEndingBalance   int64  `json:"statement_ending_balance"`
	Filename                 string `json:"filename"`
}

// StatementSectionReport summarizes reconciliation balance math for a currency section.
type StatementSectionReport struct {
	Currency         string `json:"currency"`
	StartingBalance  int64  `json:"starting_balance"`
	EndingBalance    int64  `json:"ending_balance"`
	CalculatedEnding int64  `json:"calculated_ending"`
	NetFlow          int64  `json:"net_flow"`
	Discrepancy      int64  `json:"discrepancy"`
	IsBalanced       bool   `json:"is_balanced"`
	LineCount        int    `json:"line_count"`
}

// ImportStatementDraftOutput defines outputs for finance.import_statement_draft.
type ImportStatementDraftOutput struct {
	BatchID           string                    `json:"batch_id"`
	CreatedStatements []CreatedStatementSummary `json:"created_statements"`
	SectionReports    []StatementSectionReport  `json:"section_reports"`
	UnmappedSections  []string                  `json:"unmapped_sections"`
}

func registerFinanceSteps(reg *workflow.Registry, deps WorkflowDependencies) {
	reg.RegisterStep(workflow.StepDescriptor{
		Type:                "finance.create_inbox_item",
		Owner:               "finance",
		Category:            "action",
		DisplayName:         "Create Finance Inbox Item",
		Description:         "Stages an extracted financial receipt, invoice, or bank notification into the finance inbox queue with idempotency.",
		InvalidatesPrefixes: []string{"finance."},
	}, func(ctx context.Context, execCtx *workflow.StepContext[CreateInboxItemInputs]) (CreateInboxItemOutput, error) {
		fCtx := resolveWorkflowFinanceContext(ctx, deps, execCtx.SpaceID)
		in := execCtx.Inputs

		docType := finance.ParseInboxItemDocType(in.DocType)
		vendor := strings.TrimSpace(in.Vendor)
		currency := strings.ToUpper(strings.TrimSpace(in.Currency))
		if currency == "" {
			currency = string(fCtx.BaseCurrency())
		}
		dateStr := strings.TrimSpace(in.Date)

		var flowRunID *string
		if execCtx.FlowRunID != "" {
			flowRunID = new(execCtx.FlowRunID)
		}
		var idemKey *string
		if k := strings.TrimSpace(in.IdempotencyKey); k != "" {
			idemKey = new(k)
		}
		var accountID *string
		if accID := strings.TrimSpace(in.AccountID); accID != "" {
			accountID = new(accID)
		}

		meta := make(map[string]any)
		if len(in.Metadata) > 0 {
			maps.Copy(meta, in.Metadata)
		}
		if destAccID := strings.TrimSpace(in.DestinationAccountID); destAccID != "" {
			meta["destination_account_id"] = destAccID
		}
		if dupID := strings.TrimSpace(in.PotentialDuplicateID); dupID != "" {
			meta["potential_duplicate_id"] = dupID
		}
		if borID := strings.TrimSpace(in.BorrowingID); borID != "" {
			meta["suggested_borrowing_id"] = borID
		}

		staged, err := deps.FinanceService.StageInboxItem(ctx, fCtx, &finance.StageInboxItem{
			FlowRunID:       flowRunID,
			IdempotencyKey:  idemKey,
			DocType:         docType,
			Vendor:          vendor,
			Amount:          in.AmountCents,
			Currency:        currency,
			AccountID:       accountID,
			SuggestedBudget: strings.TrimSpace(in.BudgetID),
			Date:            dateStr,
			RawPayload:      in.RawPayload,
			Metadata:        meta,
		})
		if err != nil {
			return CreateInboxItemOutput{}, fmt.Errorf("stage inbox item: %w", err)
		}

		deduplicated := idemKey != nil && staged.FlowRunID != nil && execCtx.FlowRunID != "" && *staged.FlowRunID != execCtx.FlowRunID
		return CreateInboxItemOutput{
			InboxItemID:  staged.ID,
			Deduplicated: deduplicated,
		}, nil
	})

	reg.RegisterStep(workflow.StepDescriptor{
		Type:                "finance.import_statement_draft",
		Owner:               "finance",
		Category:            "action",
		DisplayName:         "Import Statement Drafts",
		Description:         "Validates multi-currency ledger math and credit-card liability signs, resolves accounts, and persists finance.Statement drafts.",
		InvalidatesPrefixes: []string{"finance."},
	}, func(ctx context.Context, execCtx *workflow.StepContext[ImportStatementDraftInputs]) (ImportStatementDraftOutput, error) {
		fCtx := resolveWorkflowFinanceContext(ctx, deps, execCtx.SpaceID)
		return executeImportStatementDraft(ctx, fCtx, deps.FinanceService, execCtx.Inputs)
	})
}

type parsedStatementLine struct {
	DateStr     string
	Description string
	AmountCents int64
	Reference   string
}

type parsedStatementSection struct {
	Currency             string
	CardLastFour         string
	SuggestedAccountID   string
	StartingBalanceCents int64
	EndingBalanceCents   int64
	Lines                []parsedStatementLine
}

func executeImportStatementDraft(
	ctx context.Context,
	fCtx finance.Context,
	financeSvc FinanceService,
	in ImportStatementDraftInputs,
) (ImportStatementDraftOutput, error) {
	filename := strings.TrimSpace(in.Filename)
	statementDateStr := strings.TrimSpace(in.StatementDate)
	institutionName := strings.TrimSpace(in.InstitutionName)
	targetAccountID := strings.TrimSpace(in.TargetAccountID)
	docCardLastFour := strings.TrimSpace(in.CardLastFour)

	sections := normalizeStatementSections(in.Sections)
	if len(sections) == 0 {
		return ImportStatementDraftOutput{}, fmt.Errorf("no active statement sections provided")
	}

	batchID, err := id.Generate("stmt_batch_")
	if err != nil {
		batchID = fmt.Sprintf("stmt_batch_%d", time.Now().UnixNano())
	}

	accountMappings := make(map[string]*finance.Account, len(sections))
	unmappedSections := make([]string, 0)

	for i := range sections {
		sec := &sections[i]
		cardLastFour := sec.CardLastFour
		if cardLastFour == "" {
			cardLastFour = docCardLastFour
		}

		// 1. Suggested account ID matched by Janus AI
		if sec.SuggestedAccountID != "" {
			if suggestedID, parseErr := finance.ParseAccountID(sec.SuggestedAccountID); parseErr == nil {
				if acc, accErr := financeSvc.GetAccount(ctx, fCtx, suggestedID); accErr == nil && acc != nil && strings.EqualFold(string(acc.Currency), sec.Currency) {
					accountMappings[sec.Currency] = acc
					continue
				}
			}
		}

		// 2. Explicit target_account_id override if currency and card last_four match
		if targetAccountID != "" {
			if targetID, parseErr := finance.ParseAccountID(targetAccountID); parseErr == nil {
				if acc, accErr := financeSvc.GetAccount(ctx, fCtx, targetID); accErr == nil && acc != nil && strings.EqualFold(string(acc.Currency), sec.Currency) {
					if cardLastFour == "" || acc.LastFour == "" || acc.LastFour == cardLastFour {
						accountMappings[sec.Currency] = acc
						continue
					}
				}
			}
		}

		// 3. Resolve account by institution name, last_four, and currency
		acc, resErr := financeSvc.ResolveAccount(ctx, fCtx, finance.ResolveAccountOpts{
			AccountName: institutionName,
			LastFour:    cardLastFour,
			Currency:    sec.Currency,
		})
		if resErr == nil && acc != nil {
			accountMappings[sec.Currency] = acc
		} else {
			unmappedSections = append(unmappedSections, sec.Currency)
		}
	}

	sectionReports := make([]StatementSectionReport, 0, len(sections))
	for i := range sections {
		sec := &sections[i]
		var netFlow int64
		for _, l := range sec.Lines {
			netFlow += l.AmountCents
		}

		calcEnding := sec.StartingBalanceCents + netFlow
		discrepancy := sec.EndingBalanceCents - calcEnding

		acc := accountMappings[sec.Currency]
		isCreditCard := (acc != nil && acc.Type == finance.AccountTypeCreditCard) ||
			sec.CardLastFour != "" ||
			docCardLastFour != ""

		// Reconcile Credit Card / Liability sign conventions:
		if isCreditCard && sec.StartingBalanceCents > 0 && sec.EndingBalanceCents > 0 {
			ccStart := -sec.StartingBalanceCents
			ccEnd := -sec.EndingBalanceCents

			// Case A: Lines extracted with purchases POSITIVE and payments NEGATIVE.
			if ccEnd-(ccStart-netFlow) == 0 && len(sec.Lines) > 0 {
				for j := range sec.Lines {
					sec.Lines[j].AmountCents = -sec.Lines[j].AmountCents
				}
				netFlow = -netFlow
				sec.StartingBalanceCents = ccStart
				sec.EndingBalanceCents = ccEnd
				calcEnding = ccStart + netFlow
				discrepancy = ccEnd - calcEnding
			} else if discrepancy != 0 {
				// Case B: Lines are negative expenses (-), but balances were printed as positive debt (+).
				ccCalcEnding := ccStart + netFlow
				if ccEnd-ccCalcEnding == 0 {
					sec.StartingBalanceCents = ccStart
					sec.EndingBalanceCents = ccEnd
					calcEnding = ccCalcEnding
					discrepancy = 0
				}
			}
		}

		sectionReports = append(sectionReports, StatementSectionReport{
			Currency:         sec.Currency,
			StartingBalance:  sec.StartingBalanceCents,
			EndingBalance:    sec.EndingBalanceCents,
			CalculatedEnding: calcEnding,
			NetFlow:          netFlow,
			Discrepancy:      discrepancy,
			IsBalanced:       discrepancy == 0,
			LineCount:        len(sec.Lines),
		})
	}

	createdStatements := make([]CreatedStatementSummary, 0, len(sections))
	if !in.DryRun {
		stmtDate, err := time.Parse("2006-01-02", statementDateStr)
		if err != nil {
			stmtDate = fCtx.Now()
		}

		for i := range sections {
			sec := &sections[i]
			acc, ok := accountMappings[sec.Currency]
			if !ok || acc == nil {
				continue
			}

			rawCSV, err := buildStatementCSV(sec.Lines)
			if err != nil {
				return ImportStatementDraftOutput{}, fmt.Errorf("generate CSV for %s section: %w", sec.Currency, err)
			}

			secFilename := filename
			if secFilename == "" {
				secFilename = fmt.Sprintf("statement_%s.pdf", sec.Currency)
			}

			stmt := &finance.Statement{
				AccountID:                acc.ID,
				Status:                   finance.StatementStatusInProgress,
				StatementDate:            stmtDate,
				StatementStartingBalance: sec.StartingBalanceCents,
				StatementEndingBalance:   sec.EndingBalanceCents,
				Filename:                 secFilename,
				RawContent:               rawCSV,
				Config: finance.StatementConfig{
					Format: "CSV",
					CSV: &finance.CSVMapping{
						HasHeader:              true,
						Delimiter:              ",",
						DateFormat:             "YYYY-MM-DD",
						DateColumnIndex:        0,
						DescriptionColumnIndex: 1,
						AmountColumnIndex:      2,
						ReferenceColumnIndex:   3,
					},
				},
			}

			saved, err := financeSvc.ImportStatement(ctx, fCtx, acc.ID, stmt)
			if err != nil {
				return ImportStatementDraftOutput{}, fmt.Errorf("import statement draft (%s): %w", sec.Currency, err)
			}

			createdStatements = append(createdStatements, CreatedStatementSummary{
				ID:                       string(saved.ID),
				AccountID:                string(saved.AccountID),
				Currency:                 sec.Currency,
				Status:                   string(saved.Status),
				StatementDate:            saved.StatementDate.Format("2006-01-02"),
				StatementStartingBalance: saved.StatementStartingBalance,
				StatementEndingBalance:   saved.StatementEndingBalance,
				Filename:                 saved.Filename,
			})
		}
	}

	return ImportStatementDraftOutput{
		BatchID:           batchID,
		CreatedStatements: createdStatements,
		SectionReports:    sectionReports,
		UnmappedSections:  unmappedSections,
	}, nil
}

func normalizeStatementSections(raw []StatementSectionInput) []parsedStatementSection {
	sections := make([]parsedStatementSection, 0, len(raw))
	for _, s := range raw {
		sec := parsedStatementSection{
			Currency:             strings.ToUpper(strings.TrimSpace(s.Currency)),
			CardLastFour:         strings.TrimSpace(s.CardLastFour),
			SuggestedAccountID:   strings.TrimSpace(s.SuggestedAccountID),
			StartingBalanceCents: centsOrFloat(s.StartingBalanceCents, s.StartingBalance),
			EndingBalanceCents:   centsOrFloat(s.EndingBalanceCents, s.EndingBalance),
		}
		for _, l := range s.Lines {
			dateStr := strings.TrimSpace(l.DateStr)
			if dateStr == "" {
				dateStr = strings.TrimSpace(l.Date)
			}
			sec.Lines = append(sec.Lines, parsedStatementLine{
				DateStr:     dateStr,
				Description: strings.TrimSpace(l.Description),
				AmountCents: centsOrFloat(l.AmountCents, l.Amount),
				Reference:   strings.TrimSpace(l.Reference),
			})
		}
		if len(sec.Lines) == 0 && sec.StartingBalanceCents == 0 && sec.EndingBalanceCents == 0 {
			continue
		}
		sections = append(sections, sec)
	}
	return sections
}

func centsOrFloat(cents *int64, amt *float64) int64 {
	if cents != nil {
		return *cents
	}
	if amt != nil {
		return int64(math.Round(*amt * 100))
	}
	return 0
}

func buildStatementCSV(lines []parsedStatementLine) (string, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)
	if err := w.Write([]string{"Date", "Description", "Amount", "Reference"}); err != nil {
		return "", err
	}
	for _, l := range lines {
		amtStr := fmt.Sprintf("%.2f", float64(l.AmountCents)/100.0)
		if err := w.Write([]string{l.DateStr, l.Description, amtStr, l.Reference}); err != nil {
			return "", err
		}
	}
	w.Flush()
	if err := w.Error(); err != nil {
		return "", err
	}
	return buf.String(), nil
}
