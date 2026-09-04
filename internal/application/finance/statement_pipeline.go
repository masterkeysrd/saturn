package financeapp

import (
	"bytes"
	"context"
	"encoding/csv"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/loom/graph"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/pdf"
)

// StatementDocumentRequest holds incoming document parameters for statement ingestion.
type StatementDocumentRequest struct {
	Filename        string   `json:"filename"`
	ContentType     string   `json:"content_type"`
	DocumentBytes   []byte   `json:"-"`
	Password        string   `json:"password,omitempty"`
	PDFPasswords    []string `json:"pdf_passwords,omitempty"`
	TargetAccountID *string  `json:"target_account_id,omitempty"`
}

// SectionValidationReport summarizes the mathematical verification of an extracted currency section.
type SectionValidationReport struct {
	Currency         string `json:"currency"`
	StartingBalance  int64  `json:"starting_balance"`
	EndingBalance    int64  `json:"ending_balance"`
	CalculatedEnding int64  `json:"calculated_ending"`
	NetFlow          int64  `json:"net_flow"`
	Discrepancy      int64  `json:"discrepancy"` // EndingBalance - CalculatedEnding (0 if balanced)
	IsBalanced       bool   `json:"is_balanced"`
	LineCount        int    `json:"line_count"`
}

// StatementIngestionState maintains context across the side-effect-free statement processing graph.
type StatementIngestionState struct {
	SpaceID string
	Request *StatementDocumentRequest

	// Node 1: Preprocess Output
	ExtractedText string
	IsEncrypted   bool
	Decrypted     bool
	NeedsPassword bool

	// Node 2: Extractor Output
	ParsedDocument *ParsedStatementDocument

	// Node 3: Math Validation Output
	SectionReports []SectionValidationReport

	// Node 4: Account Resolution Output
	AccountMappings  map[string]*finance.Account // Currency -> resolved Account
	UnmappedSections []string                    // Currencies without an account in Saturn

	Errors []string
}

// Copy implements graph.State constraint for StatementIngestionState.
func (s *StatementIngestionState) Copy() *StatementIngestionState {
	if s == nil {
		return nil
	}

	var reportsCopy []SectionValidationReport
	if s.SectionReports != nil {
		reportsCopy = make([]SectionValidationReport, len(s.SectionReports))
		copy(reportsCopy, s.SectionReports)
	}

	var accMapCopy map[string]*finance.Account
	if s.AccountMappings != nil {
		accMapCopy = make(map[string]*finance.Account, len(s.AccountMappings))
		for k, v := range s.AccountMappings {
			accMapCopy[k] = v
		}
	}

	var unmappedCopy []string
	if s.UnmappedSections != nil {
		unmappedCopy = make([]string, len(s.UnmappedSections))
		copy(unmappedCopy, s.UnmappedSections)
	}

	var errorsCopy []string
	if s.Errors != nil {
		errorsCopy = make([]string, len(s.Errors))
		copy(errorsCopy, s.Errors)
	}

	return &StatementIngestionState{
		SpaceID:          s.SpaceID,
		Request:          s.Request,
		ExtractedText:    s.ExtractedText,
		IsEncrypted:      s.IsEncrypted,
		Decrypted:        s.Decrypted,
		NeedsPassword:    s.NeedsPassword,
		ParsedDocument:   s.ParsedDocument,
		SectionReports:   reportsCopy,
		AccountMappings:  accMapCopy,
		UnmappedSections: unmappedCopy,
		Errors:           errorsCopy,
	}
}

// IngestStatementResult contains the outcome of statement ingestion.
type IngestStatementResult struct {
	BatchID           string                    `json:"batch_id"`
	CreatedStatements []*finance.Statement      `json:"created_statements,omitempty"`
	SectionReports    []SectionValidationReport `json:"section_reports"`
	UnmappedSections  []string                  `json:"unmapped_sections,omitempty"`
	NeedsPassword     bool                      `json:"needs_password,omitempty"`
	Errors            []string                  `json:"errors,omitempty"`
}

// StatementPipelineDependencies wraps dependencies for StatementPipeline.
type StatementPipelineDependencies struct {
	FinanceService FinanceService
	Extractor      StatementExtractor
}

// StatementPipeline orchestrates the side-effect-free Loom graph and handles persistence.
type StatementPipeline struct {
	financeService FinanceService
	extractor      StatementExtractor
}

// NewStatementPipeline creates a new StatementPipeline.
func NewStatementPipeline(deps StatementPipelineDependencies) *StatementPipeline {
	return &StatementPipeline{
		financeService: deps.FinanceService,
		extractor:      deps.Extractor,
	}
}

// buildGraph compiles the pure, side-effect-free Loom inference graph.
func (p *StatementPipeline) buildGraph() (*graph.Graph[*StatementIngestionState], error) {
	return graph.New[*StatementIngestionState]().
		WithName("finance-statement-ingestion").
		AddNode("preprocess", graph.NodeFunc(p.nodePreprocess)).
		AddNode("extract", graph.NodeFunc(p.nodeExtract)).
		AddNode("validate_math", graph.NodeFunc(p.nodeValidateMath)).
		AddNode("resolve_accounts", graph.NodeFunc(p.nodeResolveAccounts)).
		AddEdge(graph.START, "preprocess").
		AddConditionalEdge("preprocess", graph.END, func(s *StatementIngestionState) bool {
			return s.NeedsPassword || len(s.Errors) > 0
		}).
		AddConditionalEdge("preprocess", "extract", func(s *StatementIngestionState) bool {
			return !s.NeedsPassword && len(s.Errors) == 0
		}).
		AddEdge("extract", "validate_math").
		AddEdge("validate_math", "resolve_accounts").
		AddEdge("resolve_accounts", graph.END).
		Build()
}

// AnalyzeDocument executes the pure Loom graph without modifying the database.
func (p *StatementPipeline) AnalyzeDocument(ctx context.Context, spaceID string, req *StatementDocumentRequest) (*StatementIngestionState, error) {
	g, err := p.buildGraph()
	if err != nil {
		return nil, fmt.Errorf("build statement pipeline graph: %w", err)
	}

	snapshot, err := g.Execute(ctx, graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
		return &StatementIngestionState{
			SpaceID:          spaceID,
			Request:          req,
			AccountMappings:  make(map[string]*finance.Account),
			UnmappedSections: make([]string, 0),
		}
	}), nil)
	if err != nil {
		return nil, fmt.Errorf("execute statement pipeline graph: %w", err)
	}

	return snapshot.State, nil
}

// IngestDocument executes the graph and persists statement drafts into the database.
func (p *StatementPipeline) IngestDocument(ctx context.Context, spaceID string, req *StatementDocumentRequest) (*IngestStatementResult, error) {
	state, err := p.AnalyzeDocument(ctx, spaceID, req)
	if err != nil {
		return nil, err
	}

	res := &IngestStatementResult{
		SectionReports:   state.SectionReports,
		UnmappedSections: state.UnmappedSections,
		NeedsPassword:    state.NeedsPassword,
		Errors:           state.Errors,
	}

	if state.NeedsPassword || len(state.Errors) > 0 || state.ParsedDocument == nil {
		return res, nil
	}

	// Generate shared batch identifier for sibling statements
	batchID, err := id.Generate("stmt_batch_")
	if err != nil {
		batchID = fmt.Sprintf("stmt_batch_%d", time.Now().UnixNano())
	}
	res.BatchID = batchID

	// Persist each mapped currency section as an independent Statement draft
	for _, section := range state.ParsedDocument.Sections {
		acc, ok := state.AccountMappings[section.Currency]
		if !ok || acc == nil {
			// Sibling section skipped until user assigns an account
			continue
		}

		// Find discrepancy report for this section
		var secReport *SectionValidationReport
		for _, r := range state.SectionReports {
			if r.Currency == section.Currency {
				secReport = &r
				break
			}
		}

		discrepancy := int64(0)
		if secReport != nil {
			discrepancy = secReport.Discrepancy
		}

		rawCSV, err := generateStandardizedCSV(section.Lines)
		if err != nil {
			return nil, fmt.Errorf("generate section CSV: %w", err)
		}

		stmtDate, err := time.Parse("2006-01-02", state.ParsedDocument.StatementDate)
		if err != nil {
			stmtDate = time.Now().UTC()
		}

		filename := req.Filename
		if filename == "" {
			filename = fmt.Sprintf("statement_%s.pdf", section.Currency)
		}

		stmt := &finance.Statement{
			SpaceID:                  finance.SpaceID(spaceID),
			AccountID:                acc.ID,
			Status:                   finance.StatementStatusInProgress,
			StatementDate:            stmtDate,
			StatementStartingBalance: section.StartingBalance,
			StatementEndingBalance:   section.EndingBalance,
			Filename:                 filename,
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
					DebitColumnIndex:       -1,
					CreditColumnIndex:      -1,
				},
			},
		}

		// Save statement draft and lines via existing domain service
		created, err := p.financeService.ImportStatement(ctx, acc.ID, stmt)
		if err != nil {
			return nil, fmt.Errorf("import statement for currency %s: %w", section.Currency, err)
		}

		_ = discrepancy
		res.CreatedStatements = append(res.CreatedStatements, created)
	}

	return res, nil
}

// 1. Preprocess Node: Handles PDF decryption and text extraction.
func (p *StatementPipeline) nodePreprocess(ctx context.Context, state *StatementIngestionState) (graph.Command[*StatementIngestionState], error) {
	if state.Request == nil || len(state.Request.DocumentBytes) == 0 {
		return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
			s.Errors = append(s.Errors, "missing document bytes")
			return s
		}), nil
	}

	docBytes := state.Request.DocumentBytes

	// Check if PDF is encrypted
	isEnc, err := pdf.IsEncrypted(docBytes)
	if err == nil && isEnc {
		decrypted := false
		var passwords []string
		if state.Request.Password != "" {
			passwords = append(passwords, state.Request.Password)
		}
		passwords = append(passwords, state.Request.PDFPasswords...)

		for _, pwd := range passwords {
			if decBytes, decErr := pdf.Decrypt(docBytes, pwd); decErr == nil {
				docBytes = decBytes
				decrypted = true
				break
			}
		}

		if !decrypted {
			return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
				s.IsEncrypted = true
				s.NeedsPassword = true
				return s
			}), nil
		}
	}

	var extractedText string
	isPDF := strings.Contains(strings.ToLower(state.Request.ContentType), "pdf") ||
		strings.HasSuffix(strings.ToLower(state.Request.Filename), ".pdf") ||
		bytes.HasPrefix(docBytes, []byte("%PDF"))

	if isPDF {
		// Extract text contents from the decrypted PDF
		txt, err := pdf.ExtractText(docBytes)
		if err != nil {
			return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
				s.Errors = append(s.Errors, fmt.Sprintf("extract text from document: %v", err))
				return s
			}), nil
		}
		extractedText = txt
	} else {
		// Raw text / plain text format
		extractedText = string(docBytes)
	}

	if strings.TrimSpace(extractedText) == "" {
		return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
			s.Errors = append(s.Errors, "document contains no readable text (scanned images require OCR)")
			return s
		}), nil
	}

	return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
		s.ExtractedText = extractedText
		s.Decrypted = isEnc
		return s
	}), nil
}

// 2. Extract Node: Runs Janus to split multi-currency sections and extract balances.
func (p *StatementPipeline) nodeExtract(ctx context.Context, state *StatementIngestionState) (graph.Command[*StatementIngestionState], error) {
	accPage, err := p.financeService.ListAccounts(ctx, finance.SpaceID(state.SpaceID), &finance.ListAccountsFilter{PageSize: 1000})
	var accounts []*finance.Account
	if err == nil && accPage != nil {
		accounts = accPage.Items
	}

	parsedDoc, err := p.extractor.Extract(ctx, state.SpaceID, state.ExtractedText, accounts)
	if err != nil {
		return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
			s.Errors = append(s.Errors, fmt.Sprintf("extract statement document: %v", err))
			return s
		}), nil
	}

	// Filter out empty installment / boilerplate sections with 0 balance and 0 lines (e.g. "Installment Credit Line DOP 0.00")
	var activeSections []ParsedStatementSection
	for _, sec := range parsedDoc.Sections {
		if len(sec.Lines) == 0 && sec.StartingBalance == 0 && sec.EndingBalance == 0 {
			continue
		}
		activeSections = append(activeSections, sec)
	}
	parsedDoc.Sections = activeSections

	if len(parsedDoc.Sections) == 0 {
		return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
			s.Errors = append(s.Errors, "no ledger sections could be extracted from statement")
			return s
		}), nil
	}

	return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
		s.ParsedDocument = parsedDoc
		return s
	}), nil
}

// 3. Validate Math Node: Checks starting_balance + sum(lines) == ending_balance per section.
func (p *StatementPipeline) nodeValidateMath(ctx context.Context, state *StatementIngestionState) (graph.Command[*StatementIngestionState], error) {
	if state.ParsedDocument == nil {
		return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState { return s }), nil
	}

	var reports []SectionValidationReport
	for i := range state.ParsedDocument.Sections {
		sec := &state.ParsedDocument.Sections[i]
		var netFlow int64
		for _, line := range sec.Lines {
			netFlow += line.Amount
		}

		calcEnding := sec.StartingBalance + netFlow
		discrepancy := sec.EndingBalance - calcEnding

		// Detect Credit Card / Liability sign convention:
		// On bank statements, credit card balances are reported as positive debt owed (e.g. Starting: 15,107.81, Ending: 33,669.24),
		// while line purchases are negative (-56,270.74) and payments are positive (+37,709.31).
		// In double-entry accounting (and Saturn ledger), liabilities are negative:
		// -15,107.81 + (-18,561.43) = -33,669.24 -> delta == 0!
		if discrepancy != 0 && sec.StartingBalance > 0 && sec.EndingBalance > 0 {
			ccStart := -sec.StartingBalance
			ccEnd := -sec.EndingBalance
			ccCalcEnding := ccStart + netFlow
			if ccEnd-ccCalcEnding == 0 {
				sec.StartingBalance = ccStart
				sec.EndingBalance = ccEnd
				calcEnding = ccCalcEnding
				discrepancy = 0
			}
		}

		reports = append(reports, SectionValidationReport{
			Currency:         sec.Currency,
			StartingBalance:  sec.StartingBalance,
			EndingBalance:    sec.EndingBalance,
			CalculatedEnding: calcEnding,
			NetFlow:          netFlow,
			Discrepancy:      discrepancy,
			IsBalanced:       discrepancy == 0,
			LineCount:        len(sec.Lines),
		})
	}

	return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
		s.SectionReports = reports
		return s
	}), nil
}

// 4. Resolve Accounts Node: Matches institution, last_four, and section currency to Saturn accounts.
func (p *StatementPipeline) nodeResolveAccounts(ctx context.Context, state *StatementIngestionState) (graph.Command[*StatementIngestionState], error) {
	if state.ParsedDocument == nil {
		return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState { return s }), nil
	}

	mappings := make(map[string]*finance.Account)
	var unmapped []string

	for _, sec := range state.ParsedDocument.Sections {
		cardLastFour := sec.CardLastFour
		if cardLastFour == "" {
			cardLastFour = state.ParsedDocument.CardLastFour
		}

		// 1. Suggested Account ID from Janus AI matching workspace accounts
		if sec.SuggestedAccountID != "" {
			suggestedID, parseErr := finance.ParseAccountID(sec.SuggestedAccountID)
			if parseErr == nil {
				acc, accErr := p.financeService.GetAccount(ctx, finance.SpaceID(state.SpaceID), suggestedID)
				if accErr == nil && acc != nil && string(acc.Currency) == sec.Currency {
					mappings[sec.Currency] = acc
					continue
				}
			}
		}

		// 2. If user explicitly passed a TargetAccountID, verify currency match and no card conflict
		if state.Request != nil && state.Request.TargetAccountID != nil && *state.Request.TargetAccountID != "" {
			targetID, parseErr := finance.ParseAccountID(*state.Request.TargetAccountID)
			if parseErr == nil {
				acc, accErr := p.financeService.GetAccount(ctx, finance.SpaceID(state.SpaceID), targetID)
				if accErr == nil && acc != nil && string(acc.Currency) == sec.Currency {
					if cardLastFour == "" || acc.LastFour == "" || acc.LastFour == cardLastFour {
						mappings[sec.Currency] = acc
						continue
					}
				}
			}
		}

		// 3. Resolve Account by institution name, card last four, and currency
		acc, err := p.financeService.ResolveAccount(ctx, finance.SpaceID(state.SpaceID), finance.ResolveAccountOpts{
			AccountName: state.ParsedDocument.InstitutionName,
			LastFour:    cardLastFour,
			Currency:    sec.Currency,
		})

		if err == nil && acc != nil {
			mappings[sec.Currency] = acc
		} else {
			unmapped = append(unmapped, sec.Currency)
		}
	}

	return graph.Update[*StatementIngestionState](func(s *StatementIngestionState) *StatementIngestionState {
		s.AccountMappings = mappings
		s.UnmappedSections = unmapped
		return s
	}), nil
}

// generateStandardizedCSV converts a slice of parsed statement lines into clean CSV content.
func generateStandardizedCSV(lines []ParsedStatementLine) (string, error) {
	var buf bytes.Buffer
	w := csv.NewWriter(&buf)

	if err := w.Write([]string{"Date", "Description", "Amount", "Reference"}); err != nil {
		return "", err
	}

	for _, l := range lines {
		amtStr := fmt.Sprintf("%.2f", float64(l.Amount)/100.0)
		refStr := ""
		if l.Reference != nil {
			refStr = *l.Reference
		}

		if err := w.Write([]string{l.DateStr, l.Description, amtStr, refStr}); err != nil {
			return "", err
		}
	}

	w.Flush()
	if err := w.Error(); err != nil {
		return "", err
	}

	return buf.String(), nil
}
