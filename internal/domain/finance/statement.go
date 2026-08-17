package finance

import (
	"encoding/csv"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

// StatementID represents a statement's unique identifier.
type StatementID string

// NewStatementID creates a new StatementID.
func NewStatementID() (StatementID, error) {
	raw, err := id.Generate(statementPrefix)
	if err != nil {
		return "", err
	}
	return StatementID(raw), nil
}

// ParseStatementID parses a string into a StatementID.
func ParseStatementID(s string) (StatementID, error) {
	if err := id.Validate(s, statementPrefix); err != nil {
		return "", fmt.Errorf("invalid statement ID: %w", err)
	}
	return StatementID(s), nil
}

// String returns the string representation.
func (sid StatementID) String() string {
	return string(sid)
}

// Validate checks if the StatementID is valid.
func (sid StatementID) Validate() error {
	return id.Validate(string(sid), statementPrefix)
}

// StatementLineID represents a statement line's unique identifier.
type StatementLineID string

// NewStatementLineID creates a new StatementLineID.
func NewStatementLineID() (StatementLineID, error) {
	raw, err := id.Generate(statementLinePrefix)
	if err != nil {
		return "", err
	}
	return StatementLineID(raw), nil
}

// ParseStatementLineID parses a string into a StatementLineID.
func ParseStatementLineID(s string) (StatementLineID, error) {
	if err := id.Validate(s, statementLinePrefix); err != nil {
		return "", fmt.Errorf("invalid statement line ID: %w", err)
	}
	return StatementLineID(s), nil
}

// String returns the string representation.
func (slid StatementLineID) String() string {
	return string(slid)
}

// Validate checks if the StatementLineID is valid.
func (slid StatementLineID) Validate() error {
	return id.Validate(string(slid), statementLinePrefix)
}

const (
	statementPrefix     = "stmt_"
	statementLinePrefix = "stln_"
)

// StatementStatus represents the status of the statement reconciliation.
type StatementStatus string

const (
	StatementStatusInProgress StatementStatus = "IN_PROGRESS"
	StatementStatusCompleted  StatementStatus = "COMPLETED"
)

// StatementLineStatus represents the reconciliation status of an individual line.
type StatementLineStatus string

const (
	StatementLineStatusUnmatched StatementLineStatus = "UNMATCHED"
	StatementLineStatusMatched   StatementLineStatus = "MATCHED"
	StatementLineStatusImported  StatementLineStatus = "IMPORTED"
	StatementLineStatusSkipped   StatementLineStatus = "SKIPPED"
)

// StatementLineActionType represents the user action kind for a statement line.
type StatementLineActionType string

const (
	StatementLineActionTypePending          StatementLineActionType = "PENDING"
	StatementLineActionTypeMatch            StatementLineActionType = "MATCH"
	StatementLineActionTypeCreateExpense    StatementLineActionType = "CREATE_EXPENSE"
	StatementLineActionTypeCreateIncome     StatementLineActionType = "CREATE_INCOME"
	StatementLineActionTypeCreateTransfer   StatementLineActionType = "CREATE_TRANSFER"
	StatementLineActionTypeConfirmScheduled StatementLineActionType = "CONFIRM_SCHEDULED"
	StatementLineActionTypeCreateRepayment  StatementLineActionType = "CREATE_REPAYMENT"
	StatementLineActionTypeSkip             StatementLineActionType = "SKIP"
)

// StatementLineAction represents the parsed draft action choice of the user.
type StatementLineAction struct {
	Type                   StatementLineActionType `json:"type"`
	TransactionID          *TransactionID          `json:"transaction_id,omitempty"`
	OverwriteTransaction   *bool                   `json:"overwrite_transaction,omitempty"`
	BudgetID               *BudgetID               `json:"budget_id,omitempty"`
	CounterpartAccountID   *AccountID              `json:"counterpart_account_id,omitempty"`
	ScheduledTransactionID *ScheduledTransactionID `json:"scheduled_transaction_id,omitempty"`
	BorrowingID            *BorrowingID            `json:"borrowing_id,omitempty"`
}

// CSVMapping holds the CSV column parsing configuration in Go.
type CSVMapping struct {
	DateColumnIndex        int32  `json:"date_column_index"`
	DescriptionColumnIndex int32  `json:"description_column_index"`
	AmountColumnIndex      int32  `json:"amount_column_index"`
	DebitColumnIndex       int32  `json:"debit_column_index"`
	CreditColumnIndex      int32  `json:"credit_column_index"`
	ReferenceColumnIndex   int32  `json:"reference_column_index"`
	HasHeader              bool   `json:"has_header"`
	Delimiter              string `json:"delimiter"`
	DateFormat             string `json:"date_format"`
}

// StatementConfig holds the configuration for statement parsing in Go.
type StatementConfig struct {
	Format string      `json:"format"` // e.g. "CSV"
	CSV    *CSVMapping `json:"csv,omitempty"`
}

// Statement represents an uploaded bank/credit card/wallet statement.
type Statement struct {
	ID                       StatementID
	SpaceID                  SpaceID
	AccountID                AccountID
	Status                   StatementStatus
	StatementDate            time.Time
	StatementStartingBalance int64
	StatementEndingBalance   int64
	Filename                 string
	Config                   StatementConfig
	RawContent               string
	CreateTime               time.Time
	UpdateTime               time.Time
	Version                  int64
}

// Init prepares a new statement entity for creation by generating an ID (if missing),
// setting initial status to IN_PROGRESS, and populating creation timestamps.
func (s *Statement) Init() error {
	if string(s.ID) == "" {
		stmtID, err := NewStatementID()
		if err != nil {
			return fmt.Errorf("generate statement ID: %w", err)
		}
		s.ID = stmtID
	}
	if s.Status == "" {
		s.Status = StatementStatusInProgress
	}
	if s.Version == 0 {
		s.Version = 1
	}
	now := time.Now().UTC()
	if s.CreateTime.IsZero() {
		s.CreateTime = now
	}
	s.UpdateTime = now
	return nil
}

// Validate checks if the Statement has valid properties.
func (s *Statement) Validate() error {
	if err := s.ID.Validate(); err != nil {
		return fmt.Errorf("validate ID: %w", err)
	}
	if err := s.SpaceID.Validate(); err != nil {
		return fmt.Errorf("validate space ID: %w", err)
	}
	if err := s.AccountID.Validate(); err != nil {
		return fmt.Errorf("validate account ID: %w", err)
	}
	if s.Status != StatementStatusInProgress && s.Status != StatementStatusCompleted {
		return fmt.Errorf("invalid statement status: %s", s.Status)
	}
	if s.StatementDate.IsZero() {
		return fmt.Errorf("statement date is required")
	}
	if s.Filename == "" {
		return fmt.Errorf("filename is required")
	}
	if s.Config.Format == "" {
		return fmt.Errorf("statement config format is required")
	}
	if s.RawContent == "" {
		return fmt.Errorf("raw content is required")
	}
	return nil
}

// DecodeLines parses raw statement content based on the configured format (e.g. CSV)
// and returns the constructed and validated domain StatementLine entities.
func (s *Statement) DecodeLines() ([]*StatementLine, error) {
	if s.Config.Format != "CSV" || s.Config.CSV == nil {
		return nil, errors.New("unsupported statement configuration format")
	}
	return s.decodeCSVLines()
}

func (s *Statement) decodeCSVLines() ([]*StatementLine, error) {
	mapping := *s.Config.CSV

	r := csv.NewReader(strings.NewReader(s.RawContent))
	if mapping.Delimiter != "" {
		runes := []rune(mapping.Delimiter)
		if len(runes) > 0 {
			r.Comma = runes[0]
		}
	}

	records, err := r.ReadAll()
	if err != nil {
		return nil, fmt.Errorf("read raw CSV content: %w", err)
	}

	if len(records) == 0 {
		return nil, errors.New("empty CSV statement content")
	}

	startIndex := 0
	if mapping.HasHeader {
		startIndex = 1
	}

	var lines []*StatementLine
	rowIndex := int32(0)

	for i := startIndex; i < len(records); i++ {
		row := records[i]
		if len(row) == 0 {
			continue
		}

		if int(mapping.DateColumnIndex) >= len(row) ||
			int(mapping.DescriptionColumnIndex) >= len(row) {
			return nil, fmt.Errorf("CSV row at line %d has fewer columns than configured date/description mapping", i)
		}

		rawDate := strings.TrimSpace(row[mapping.DateColumnIndex])
		rawDesc := strings.TrimSpace(row[mapping.DescriptionColumnIndex])

		// Standardize date format
		dateStr := rawDate
		if mapping.DateFormat != "" {
			t, err := time.Parse(mapping.DateFormat, rawDate)
			if err == nil {
				dateStr = t.Format("2006-01-02")
			}
		}

		// Resolve Amount (Single column mode vs Separate columns mode)
		var amount int64
		if mapping.AmountColumnIndex >= 0 {
			if int(mapping.AmountColumnIndex) >= len(row) {
				return nil, fmt.Errorf("CSV row at line %d has fewer columns than configured amount mapping", i)
			}
			rawAmount := strings.TrimSpace(row[mapping.AmountColumnIndex])
			if rawAmount != "" {
				parsed, err := parseAmountToCents(rawAmount)
				if err != nil {
					return nil, fmt.Errorf("parse amount '%s' at row %d: %w", rawAmount, i, err)
				}
				amount = parsed
			}
		} else {
			// Debit / Credit Dual Column Mode
			var parsedDebit, parsedCredit int64
			var hasDebit, hasCredit bool

			if mapping.DebitColumnIndex >= 0 && int(mapping.DebitColumnIndex) < len(row) {
				rawDebit := strings.TrimSpace(row[mapping.DebitColumnIndex])
				if rawDebit != "" {
					val, err := parseAmountToCents(rawDebit)
					if err == nil && val != 0 {
						parsedDebit = val
						hasDebit = true
					}
				}
			}

			if mapping.CreditColumnIndex >= 0 && int(mapping.CreditColumnIndex) < len(row) {
				rawCredit := strings.TrimSpace(row[mapping.CreditColumnIndex])
				if rawCredit != "" {
					val, err := parseAmountToCents(rawCredit)
					if err == nil && val != 0 {
						parsedCredit = val
						hasCredit = true
					}
				}
			}

			if hasDebit {
				// Debits represent outflows/charges (negative)
				if parsedDebit > 0 {
					amount = -parsedDebit
				} else {
					amount = parsedDebit
				}
			} else if hasCredit {
				// Credits represent inflows/deposits (positive)
				if parsedCredit < 0 {
					amount = -parsedCredit
				} else {
					amount = parsedCredit
				}
			}
		}

		if rawDate == "" && rawDesc == "" && amount == 0 {
			continue
		}

		var refPtr *string
		if mapping.ReferenceColumnIndex >= 0 && int(mapping.ReferenceColumnIndex) < len(row) {
			refVal := strings.TrimSpace(row[mapping.ReferenceColumnIndex])
			if refVal != "" {
				refPtr = &refVal
			}
		}

		line := &StatementLine{
			RowIndex:    rowIndex,
			DateStr:     dateStr,
			Description: rawDesc,
			Amount:      amount,
			Reference:   refPtr,
		}

		if err := line.Init(s.ID); err != nil {
			return nil, err
		}

		if err := line.Validate(); err != nil {
			return nil, fmt.Errorf("validate parsed line at row %d: %w", i, err)
		}

		lines = append(lines, line)
		rowIndex++
	}

	return lines, nil
}

// StatementPatchSchema defines patchable fields for a Statement entity.
var StatementPatchSchema = patch.NewSchema[Statement]().
	Register("statement_starting_balance", patch.Field(func(s *Statement) *int64 { return &s.StatementStartingBalance })).
	Register("statement_ending_balance", patch.Field(func(s *Statement) *int64 { return &s.StatementEndingBalance })).
	Register("statement_date", patch.Field(func(s *Statement) *time.Time { return &s.StatementDate })).
	Register("version", patch.Field(func(s *Statement) *int64 { return &s.Version }))

// ApplyPatch applies partial updates from an incoming statement based on the field mask.
func (s *Statement) ApplyPatch(incoming *Statement, mask []string) error {
	if err := StatementPatchSchema.Apply(s, incoming, mask); err != nil {
		return err
	}
	return s.Validate()
}

// StatementLine represents a single parsed transaction row in a statement.
type StatementLine struct {
	ID                   StatementLineID
	StatementID          StatementID
	RowIndex             int32
	DateStr              string
	Description          string
	Amount               int64
	Reference            *string
	Action               StatementLineAction
	Status               StatementLineStatus
	MatchedTransactionID *TransactionID
	Suggestions          *StatementLineSuggestions
	Version              int64
}

// StatementLineSuggestions contains suggestions resolved by the matching engine.
type StatementLineSuggestions struct {
	TransactionType TransactionType
	BudgetID        *BudgetID
	Matches         []*Transaction
}

// Init prepares a new statement line entity for creation by generating an ID (if missing),
// binding to its statement ID, setting initial status to UNMATCHED, and default action to PENDING.
func (sl *StatementLine) Init(statementID StatementID) error {
	if string(sl.ID) == "" {
		lineID, err := NewStatementLineID()
		if err != nil {
			return fmt.Errorf("generate statement line ID: %w", err)
		}
		sl.ID = lineID
	}
	sl.StatementID = statementID
	if sl.Status == "" {
		sl.Status = StatementLineStatusUnmatched
	}
	if sl.Action.Type == "" {
		sl.Action = StatementLineAction{Type: StatementLineActionTypePending}
	}
	if sl.Version == 0 {
		sl.Version = 1
	}
	return nil
}

// Validate checks if the StatementLine has valid properties.
func (sl *StatementLine) Validate() error {
	if err := sl.ID.Validate(); err != nil {
		return fmt.Errorf("validate ID: %w", err)
	}
	if err := sl.StatementID.Validate(); err != nil {
		return fmt.Errorf("validate statement ID: %w", err)
	}
	if sl.RowIndex < 0 {
		return fmt.Errorf("row index cannot be negative")
	}
	if sl.DateStr == "" {
		return fmt.Errorf("date string is required")
	}
	if sl.Description == "" {
		return fmt.Errorf("description is required")
	}
	switch sl.Status {
	case StatementLineStatusUnmatched, StatementLineStatusMatched, StatementLineStatusImported, StatementLineStatusSkipped:
		// Valid
	default:
		return fmt.Errorf("invalid line status: %s", sl.Status)
	}
	return nil
}

// StatementLinePatchSchema defines patchable fields for a StatementLine entity.
var StatementLinePatchSchema = patch.NewSchema[StatementLine]().
	Register("status", patch.Field(func(l *StatementLine) *StatementLineStatus { return &l.Status })).
	Register("action", patch.Field(func(l *StatementLine) *StatementLineAction { return &l.Action })).
	Register("matched_transaction_id", patch.Field(func(l *StatementLine) **TransactionID { return &l.MatchedTransactionID })).
	Register("description", patch.Field(func(l *StatementLine) *string { return &l.Description })).
	Register("amount", patch.Field(func(l *StatementLine) *int64 { return &l.Amount })).
	Register("version", patch.Field(func(l *StatementLine) *int64 { return &l.Version }))

// ApplyPatch applies partial updates from an incoming statement line based on the field mask.
func (sl *StatementLine) ApplyPatch(incoming *StatementLine, mask []string) error {
	if err := StatementLinePatchSchema.Apply(sl, incoming, mask); err != nil {
		return err
	}
	if sl.Action.Type == StatementLineActionTypeMatch && sl.Action.TransactionID != nil {
		sl.MatchedTransactionID = sl.Action.TransactionID
		if sl.Status == "" || sl.Status == StatementLineStatusUnmatched {
			sl.Status = StatementLineStatusMatched
		}
	} else if sl.Action.Type == StatementLineActionTypeSkip {
		sl.Status = StatementLineStatusSkipped
		sl.MatchedTransactionID = nil
	}
	return sl.Validate()
}

// StatementLineTransactionOpts defines parameters for constructing a Transaction from a StatementLine.
type StatementLineTransactionOpts struct {
	SpaceID      SpaceID
	AccountID    AccountID
	Currency     Currency
	Type         TransactionType
	BudgetID     *BudgetID
	FallbackDate time.Time
}

// NewTransaction constructs a valid Transaction entity linked to this StatementLine.
func (sl *StatementLine) NewTransaction(opts StatementLineTransactionOpts) (*Transaction, error) {
	if err := opts.SpaceID.Validate(); err != nil {
		return nil, fmt.Errorf("validate space ID: %w", err)
	}
	if err := opts.AccountID.Validate(); err != nil {
		return nil, fmt.Errorf("validate account ID: %w", err)
	}

	absAmount := sl.Amount
	if absAmount < 0 {
		absAmount = -absAmount
	}

	txnType := opts.Type
	if txnType == "" {
		if sl.Amount < 0 {
			txnType = TransactionTypeExpense
		} else {
			txnType = TransactionTypeIncome
		}
	}

	tDate, _ := time.Parse("2006-01-02", sl.DateStr)
	if tDate.IsZero() {
		if !opts.FallbackDate.IsZero() {
			tDate = opts.FallbackDate
		} else {
			tDate = time.Now().UTC()
		}
	}

	now := time.Now().UTC()
	txn := &Transaction{
		SpaceID:         opts.SpaceID,
		Type:            txnType,
		BudgetID:        opts.BudgetID,
		AccountID:       &opts.AccountID,
		Amount:          absAmount,
		Currency:        opts.Currency,
		Description:     sl.Description,
		TransactionDate: tDate,
		EffectiveDate:   tDate,
		Metadata: TransactionMetadata{
			Reconciled:                true,
			ReconciliationStatementID: string(sl.StatementID),
			ReconciledAt:              &now,
		},
	}

	return txn, nil
}

// StatementLineTransferOpts defines parameters for constructing a Transfer from a StatementLine.
type StatementLineTransferOpts struct {
	SpaceID              SpaceID
	StatementAccountID   AccountID
	CounterpartAccountID AccountID
	FallbackDate         time.Time
}

// NewTransfer constructs a valid Transfer entity and leg options linked to this StatementLine.
func (sl *StatementLine) NewTransfer(opts StatementLineTransferOpts) (*Transfer, CreateTransferOpts, error) {
	if err := opts.SpaceID.Validate(); err != nil {
		return nil, CreateTransferOpts{}, fmt.Errorf("validate space ID: %w", err)
	}
	if err := opts.StatementAccountID.Validate(); err != nil {
		return nil, CreateTransferOpts{}, fmt.Errorf("validate statement account ID: %w", err)
	}
	if err := opts.CounterpartAccountID.Validate(); err != nil {
		return nil, CreateTransferOpts{}, fmt.Errorf("validate counterpart account ID: %w", err)
	}

	absAmount := sl.Amount
	if absAmount < 0 {
		absAmount = -absAmount
	}

	tDate, _ := time.Parse("2006-01-02", sl.DateStr)
	if tDate.IsZero() {
		if !opts.FallbackDate.IsZero() {
			tDate = opts.FallbackDate
		} else {
			tDate = time.Now().UTC()
		}
	}

	now := time.Now().UTC()
	reconMeta := &TransactionMetadata{
		Reconciled:                true,
		ReconciliationStatementID: string(sl.StatementID),
		ReconciledAt:              &now,
	}

	var srcAccID, destAccID AccountID
	var transferOpts CreateTransferOpts
	if sl.Amount < 0 {
		// Outflow from statement account to counterpart account
		srcAccID = opts.StatementAccountID
		destAccID = opts.CounterpartAccountID
		transferOpts.OutflowMetadata = reconMeta
	} else {
		// Inflow into statement account from counterpart account
		srcAccID = opts.CounterpartAccountID
		destAccID = opts.StatementAccountID
		transferOpts.InflowMetadata = reconMeta
	}

	transfer := &Transfer{
		SpaceID:              opts.SpaceID,
		SourceAccountID:      srcAccID,
		DestinationAccountID: destAccID,
		SourceAmount:         absAmount,
		DestinationAmount:    absAmount,
		TransferDate:         tDate,
		Notes:                sl.Description,
	}

	return transfer, transferOpts, nil
}

func parseAmountToCents(s string) (int64, error) {
	var sb strings.Builder
	isNegative := false
	for _, r := range s {
		if r == '-' || r == '(' {
			isNegative = true
		} else if r >= '0' && r <= '9' {
			sb.WriteRune(r)
		} else if r == '.' {
			sb.WriteRune(r)
		}
	}
	cleaned := sb.String()
	if cleaned == "" {
		return 0, fmt.Errorf("empty amount string")
	}

	parts := strings.Split(cleaned, ".")
	if len(parts) == 1 {
		val, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil {
			return 0, err
		}
		cents := val * 100
		if isNegative {
			cents = -cents
		}
		return cents, nil
	} else if len(parts) == 2 {
		wholeVal, err := strconv.ParseInt(parts[0], 10, 64)
		if err != nil && parts[0] != "" {
			return 0, err
		}
		fracStr := parts[1]
		if len(fracStr) > 2 {
			fracStr = fracStr[:2]
		} else if len(fracStr) == 1 {
			fracStr = fracStr + "0"
		} else if len(fracStr) == 0 {
			fracStr = "00"
		}
		fracVal, err := strconv.ParseInt(fracStr, 10, 64)
		if err != nil {
			return 0, err
		}
		cents := wholeVal*100 + fracVal
		if isNegative {
			cents = -cents
		}
		return cents, nil
	}
	return 0, fmt.Errorf("invalid decimal format")
}
