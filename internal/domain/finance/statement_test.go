package finance

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

func TestParseAmountToCents(t *testing.T) {
	tests := []struct {
		input   string
		want    int64
		wantErr bool
	}{
		{"200.00", 20000, false},
		{"200", 20000, false},
		{"-200.50", -20050, false},
		{"($200.50)", -20050, false},
		{"$1,250.75", 125075, false},
		{"- $1,250.75", -125075, false},
		{"", 0, true},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			got, err := parseAmountToCents(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("parseAmountToCents(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
				return
			}
			if got != tt.want {
				t.Errorf("parseAmountToCents(%q) = %v, want %v", tt.input, got, tt.want)
			}
		})
	}
}

func TestStatementLine_NewTransaction(t *testing.T) {
	stID, _ := NewStatementID()
	spID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	accID, _ := NewAccountID()
	bgtID, _ := NewBudgetID()
	fallback := time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name     string
		line     *StatementLine
		opts     StatementLineTransactionOpts
		wantErr  bool
		checkTxn func(t *testing.T, txn *Transaction)
	}{
		{
			name: "invalid space ID",
			line: &StatementLine{StatementID: stID, Amount: -1000},
			opts: StatementLineTransactionOpts{
				SpaceID:   "invalid",
				AccountID: accID,
			},
			wantErr: true,
		},
		{
			name: "invalid account ID",
			line: &StatementLine{StatementID: stID, Amount: -1000},
			opts: StatementLineTransactionOpts{
				SpaceID:   spID,
				AccountID: "invalid",
			},
			wantErr: true,
		},
		{
			name: "negative amount creates expense with parsed date",
			line: &StatementLine{
				StatementID: stID,
				Amount:      -2500,
				DateStr:     "2026-08-01",
				Description: "Lunch",
			},
			opts: StatementLineTransactionOpts{
				SpaceID:   spID,
				AccountID: accID,
				BudgetID:  &bgtID,
				Currency:  "USD",
			},
			wantErr: false,
			checkTxn: func(t *testing.T, txn *Transaction) {
				if txn.Amount != 2500 {
					t.Errorf("Amount = %d, want 2500", txn.Amount)
				}
				if txn.Type != TransactionTypeExpense {
					t.Errorf("Type = %s, want EXPENSE", txn.Type)
				}
				if !txn.Metadata.Reconciled {
					t.Error("expected Reconciled to be true")
				}
			},
		},
		{
			name: "positive amount creates income with fallback date",
			line: &StatementLine{
				StatementID: stID,
				Amount:      10000,
				DateStr:     "not-a-date",
				Description: "Salary",
			},
			opts: StatementLineTransactionOpts{
				SpaceID:      spID,
				AccountID:    accID,
				FallbackDate: fallback,
				Currency:     "USD",
			},
			wantErr: false,
			checkTxn: func(t *testing.T, txn *Transaction) {
				if txn.Amount != 10000 {
					t.Errorf("Amount = %d, want 10000", txn.Amount)
				}
				if txn.Type != TransactionTypeIncome {
					t.Errorf("Type = %s, want INCOME", txn.Type)
				}
				if !txn.TransactionDate.Equal(fallback) {
					t.Errorf("TransactionDate = %v, want %v", txn.TransactionDate, fallback)
				}
			},
		},
		{
			name: "zero fallback date uses time.Now()",
			line: &StatementLine{
				StatementID: stID,
				Amount:      3000,
				DateStr:     "bad-date",
			},
			opts: StatementLineTransactionOpts{
				SpaceID:   spID,
				AccountID: accID,
				Currency:  "USD",
			},
			wantErr: false,
			checkTxn: func(t *testing.T, txn *Transaction) {
				if txn.TransactionDate.IsZero() {
					t.Error("expected non-zero TransactionDate")
				}
			},
		},
		{
			name: "explicit type overrides inferred type",
			line: &StatementLine{
				StatementID: stID,
				Amount:      3000,
				DateStr:     "2026-08-01",
			},
			opts: StatementLineTransactionOpts{
				SpaceID:   spID,
				AccountID: accID,
				Type:      TransactionTypeExpense,
				BudgetID:  &bgtID,
				Currency:  "USD",
			},
			wantErr: false,
			checkTxn: func(t *testing.T, txn *Transaction) {
				if txn.Type != TransactionTypeExpense {
					t.Errorf("Type = %s, want EXPENSE", txn.Type)
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			txn, err := tt.line.NewTransaction(tt.opts)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewTransaction() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.checkTxn != nil {
				tt.checkTxn(t, txn)
			}
		})
	}
}

func TestStatementLine_NewTransfer(t *testing.T) {
	stID, _ := NewStatementID()
	spID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	srcAccID, _ := NewAccountID()
	destAccID, _ := NewAccountID()
	fallback := time.Date(2026, 8, 15, 12, 0, 0, 0, time.UTC)

	tests := []struct {
		name     string
		line     *StatementLine
		opts     StatementLineTransferOpts
		wantErr  bool
		checkTrf func(t *testing.T, trf *Transfer, trfOpts CreateTransferOpts)
	}{
		{
			name: "invalid space ID",
			line: &StatementLine{StatementID: stID, Amount: -500},
			opts: StatementLineTransferOpts{
				SpaceID:              "invalid",
				StatementAccountID:   srcAccID,
				CounterpartAccountID: destAccID,
			},
			wantErr: true,
		},
		{
			name: "invalid statement account ID",
			line: &StatementLine{StatementID: stID, Amount: -500},
			opts: StatementLineTransferOpts{
				SpaceID:              spID,
				StatementAccountID:   "invalid",
				CounterpartAccountID: destAccID,
			},
			wantErr: true,
		},
		{
			name: "invalid counterpart account ID",
			line: &StatementLine{StatementID: stID, Amount: -500},
			opts: StatementLineTransferOpts{
				SpaceID:              spID,
				StatementAccountID:   srcAccID,
				CounterpartAccountID: "invalid",
			},
			wantErr: true,
		},
		{
			name: "negative amount creates outflow transfer",
			line: &StatementLine{
				StatementID: stID,
				Amount:      -5000,
				DateStr:     "2026-08-01",
				Description: "Transfer to Savings",
			},
			opts: StatementLineTransferOpts{
				SpaceID:              spID,
				StatementAccountID:   srcAccID,
				CounterpartAccountID: destAccID,
			},
			wantErr: false,
			checkTrf: func(t *testing.T, trf *Transfer, trfOpts CreateTransferOpts) {
				if trf.SourceAccountID != srcAccID || trf.DestinationAccountID != destAccID {
					t.Errorf("transfer accounts mismatch: src %s, dest %s", trf.SourceAccountID, trf.DestinationAccountID)
				}
				if trf.SourceAmount != 5000 || trf.DestinationAmount != 5000 {
					t.Errorf("transfer amount mismatch: src %d, dest %d", trf.SourceAmount, trf.DestinationAmount)
				}
				if trfOpts.OutflowMetadata == nil || !trfOpts.OutflowMetadata.Reconciled {
					t.Error("expected OutflowMetadata.Reconciled to be true")
				}
			},
		},
		{
			name: "positive amount creates inflow transfer with fallback date",
			line: &StatementLine{
				StatementID: stID,
				Amount:      5000,
				DateStr:     "bad-date",
				Description: "Transfer from Checking",
			},
			opts: StatementLineTransferOpts{
				SpaceID:              spID,
				StatementAccountID:   destAccID,
				CounterpartAccountID: srcAccID,
				FallbackDate:         fallback,
			},
			wantErr: false,
			checkTrf: func(t *testing.T, trf *Transfer, trfOpts CreateTransferOpts) {
				if trf.SourceAccountID != srcAccID || trf.DestinationAccountID != destAccID {
					t.Errorf("transfer accounts mismatch: src %s, dest %s", trf.SourceAccountID, trf.DestinationAccountID)
				}
				if trfOpts.InflowMetadata == nil || !trfOpts.InflowMetadata.Reconciled {
					t.Error("expected InflowMetadata.Reconciled to be true")
				}
				if !trf.TransferDate.Equal(fallback) {
					t.Errorf("TransferDate = %v, want %v", trf.TransferDate, fallback)
				}
			},
		},
		{
			name: "zero fallback date uses time.Now()",
			line: &StatementLine{
				StatementID: stID,
				Amount:      2000,
				DateStr:     "bad-date",
			},
			opts: StatementLineTransferOpts{
				SpaceID:              spID,
				StatementAccountID:   destAccID,
				CounterpartAccountID: srcAccID,
			},
			wantErr: false,
			checkTrf: func(t *testing.T, trf *Transfer, trfOpts CreateTransferOpts) {
				if trf.TransferDate.IsZero() {
					t.Error("expected non-zero TransferDate")
				}
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			trf, trfOpts, err := tt.line.NewTransfer(tt.opts)
			if (err != nil) != tt.wantErr {
				t.Errorf("NewTransfer() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && tt.checkTrf != nil {
				tt.checkTrf(t, trf, trfOpts)
			}
		})
	}
}

func TestStatement_InvertSigns(t *testing.T) {
	stmt := &Statement{
		Status:                   StatementStatusInProgress,
		StatementStartingBalance: 10000,
		StatementEndingBalance:   25000,
	}

	if err := stmt.InvertSigns(); err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if stmt.StatementStartingBalance != -10000 {
		t.Errorf("expected starting balance -10000, got %d", stmt.StatementStartingBalance)
	}
	if stmt.StatementEndingBalance != -25000 {
		t.Errorf("expected ending balance -25000, got %d", stmt.StatementEndingBalance)
	}

	// Double inversion returns to original
	if err := stmt.InvertSigns(); err != nil {
		t.Fatalf("unexpected error on second invert: %v", err)
	}
	if stmt.StatementStartingBalance != 10000 {
		t.Errorf("expected starting balance 10000, got %d", stmt.StatementStartingBalance)
	}
	if stmt.StatementEndingBalance != 25000 {
		t.Errorf("expected ending balance 25000, got %d", stmt.StatementEndingBalance)
	}

	// Completed statement should reject inversion
	stmt.Status = StatementStatusCompleted
	if err := stmt.InvertSigns(); err == nil {
		t.Error("expected error inverting completed statement, got nil")
	}
}

func TestStatementLine_InvertSign(t *testing.T) {
	tests := []struct {
		name       string
		amount     int64
		actionType StatementLineActionType
		wantAmount int64
		wantAction StatementLineActionType
	}{
		{
			name:       "income flipped to expense",
			amount:     5000,
			actionType: StatementLineActionTypeCreateIncome,
			wantAmount: -5000,
			wantAction: StatementLineActionTypeCreateExpense,
		},
		{
			name:       "expense flipped to income",
			amount:     -8000,
			actionType: StatementLineActionTypeCreateExpense,
			wantAmount: 8000,
			wantAction: StatementLineActionTypeCreateIncome,
		},
		{
			name:       "match action preserved",
			amount:     -3000,
			actionType: StatementLineActionTypeMatch,
			wantAmount: 3000,
			wantAction: StatementLineActionTypeMatch,
		},
		{
			name:       "pending action preserved",
			amount:     1200,
			actionType: StatementLineActionTypePending,
			wantAmount: -1200,
			wantAction: StatementLineActionTypePending,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			line := &StatementLine{
				Amount: tt.amount,
				Action: StatementLineAction{Type: tt.actionType},
			}
			line.InvertSign()
			if line.Amount != tt.wantAmount {
				t.Errorf("expected amount %d, got %d", tt.wantAmount, line.Amount)
			}
			if line.Action.Type != tt.wantAction {
				t.Errorf("expected action %s, got %s", tt.wantAction, line.Action.Type)
			}
		})
	}
}

func TestStatementID(t *testing.T) {
	stID, err := NewStatementID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid statement ID", string(stID), false},
		{"invalid prefix", "stln_12345", true},
		{"empty string", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := ParseStatementID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseStatementID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if !tt.wantErr {
				if parsed.String() != tt.input {
					t.Errorf("String() = %q, want %q", parsed.String(), tt.input)
				}
				if err := parsed.Validate(); err != nil {
					t.Errorf("Validate() error = %v", err)
				}
			}
		})
	}
}

func TestStatementLineID(t *testing.T) {
	slID, err := NewStatementLineID()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	tests := []struct {
		name    string
		input   string
		wantErr bool
	}{
		{"valid statement line ID", string(slID), false},
		{"invalid prefix", "stmt_12345", true},
		{"empty string", "", true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			parsed, err := ParseStatementLineID(tt.input)
			if (err != nil) != tt.wantErr {
				t.Errorf("ParseStatementLineID(%q) error = %v, wantErr %v", tt.input, err, tt.wantErr)
			}
			if !tt.wantErr {
				if parsed.String() != tt.input {
					t.Errorf("String() = %q, want %q", parsed.String(), tt.input)
				}
				if err := parsed.Validate(); err != nil {
					t.Errorf("Validate() error = %v", err)
				}
			}
		})
	}
}

func TestStatement_Init(t *testing.T) {
	tests := []struct {
		name      string
		initialID StatementID
	}{
		{
			name:      "generates ID when empty",
			initialID: "",
		},
		{
			name:      "preserves existing ID",
			initialID: StatementID("stmt_2dE1V8ZqWz4eS2N9yX3bL1mK7pO"),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := &Statement{ID: tt.initialID}
			err := s.Init()
			if err != nil {
				t.Fatalf("Init() error = %v", err)
			}
			if s.ID == "" {
				t.Error("expected non-empty ID")
			}
			if s.Status != StatementStatusInProgress {
				t.Errorf("Status = %s, want %s", s.Status, StatementStatusInProgress)
			}
			if s.Version != 1 {
				t.Errorf("Version = %d, want 1", s.Version)
			}
			if s.CreateTime.IsZero() || s.UpdateTime.IsZero() {
				t.Error("expected timestamps to be set")
			}
		})
	}
}

func TestStatement_Validate_Table(t *testing.T) {
	stID, _ := NewStatementID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	accID, _ := NewAccountID()
	now := time.Now().UTC()

	tests := []struct {
		name      string
		statement Statement
		wantErr   bool
	}{
		{
			name: "valid statement in progress",
			statement: Statement{
				ID:            stID,
				SpaceID:       spaceID,
				AccountID:     accID,
				Status:        StatementStatusInProgress,
				StatementDate: now,
				Filename:      "statement.csv",
				Config:        StatementConfig{Format: "CSV"},
				RawContent:    "Date,Desc,Amount\n2026-08-01,Store,10.00",
			},
			wantErr: false,
		},
		{
			name: "valid statement completed",
			statement: Statement{
				ID:            stID,
				SpaceID:       spaceID,
				AccountID:     accID,
				Status:        StatementStatusCompleted,
				StatementDate: now,
				Filename:      "statement.csv",
				Config:        StatementConfig{Format: "CSV"},
				RawContent:    "Date,Desc,Amount\n2026-08-01,Store,10.00",
			},
			wantErr: false,
		},
		{
			name: "invalid status",
			statement: Statement{
				ID:            stID,
				SpaceID:       spaceID,
				AccountID:     accID,
				Status:        "PENDING",
				StatementDate: now,
				Filename:      "statement.csv",
				Config:        StatementConfig{Format: "CSV"},
				RawContent:    "Date,Desc,Amount\n2026-08-01,Store,10.00",
			},
			wantErr: true,
		},
		{
			name: "zero statement date",
			statement: Statement{
				ID:            stID,
				SpaceID:       spaceID,
				AccountID:     accID,
				Status:        StatementStatusInProgress,
				StatementDate: time.Time{},
				Filename:      "statement.csv",
				Config:        StatementConfig{Format: "CSV"},
				RawContent:    "data",
			},
			wantErr: true,
		},
		{
			name: "empty filename",
			statement: Statement{
				ID:            stID,
				SpaceID:       spaceID,
				AccountID:     accID,
				Status:        StatementStatusInProgress,
				StatementDate: now,
				Filename:      "",
				Config:        StatementConfig{Format: "CSV"},
				RawContent:    "data",
			},
			wantErr: true,
		},
		{
			name: "empty config format",
			statement: Statement{
				ID:            stID,
				SpaceID:       spaceID,
				AccountID:     accID,
				Status:        StatementStatusInProgress,
				StatementDate: now,
				Filename:      "statement.csv",
				Config:        StatementConfig{Format: ""},
				RawContent:    "data",
			},
			wantErr: true,
		},
		{
			name: "empty raw content",
			statement: Statement{
				ID:            stID,
				SpaceID:       spaceID,
				AccountID:     accID,
				Status:        StatementStatusInProgress,
				StatementDate: now,
				Filename:      "statement.csv",
				Config:        StatementConfig{Format: "CSV"},
				RawContent:    "",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.statement.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("Statement.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestStatement_DecodeLines_Table(t *testing.T) {
	stID, _ := NewStatementID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	accID, _ := NewAccountID()
	now := time.Now().UTC()

	tests := []struct {
		name      string
		statement Statement
		wantCount int
		wantErr   bool
	}{
		{
			name: "unsupported non-CSV format",
			statement: Statement{
				Config: StatementConfig{Format: "OFX"},
			},
			wantErr: true,
		},
		{
			name: "nil CSV config",
			statement: Statement{
				Config: StatementConfig{Format: "CSV", CSV: nil},
			},
			wantErr: true,
		},
		{
			name: "valid CSV decode",
			statement: Statement{
				ID:            stID,
				SpaceID:       spaceID,
				AccountID:     accID,
				Status:        StatementStatusInProgress,
				StatementDate: now,
				Filename:      "test.csv",
				Config: StatementConfig{
					Format: "CSV",
					CSV: &CSVMapping{
						DateColumnIndex:        0,
						DescriptionColumnIndex: 1,
						AmountColumnIndex:      2,
						HasHeader:              true,
						Delimiter:              ",",
						DateFormat:             "2006-01-02",
					},
				},
				RawContent: "Date,Description,Amount\n2026-08-01,Groceries,-50.25\n2026-08-02,Salary,2500.00",
			},
			wantCount: 2,
			wantErr:   false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			lines, err := tt.statement.DecodeLines()
			if (err != nil) != tt.wantErr {
				t.Errorf("DecodeLines() error = %v, wantErr %v", err, tt.wantErr)
			}
			if !tt.wantErr && len(lines) != tt.wantCount {
				t.Errorf("DecodeLines() got %d lines, want %d", len(lines), tt.wantCount)
			}
		})
	}
}

func TestStatement_ApplyPatch_Table(t *testing.T) {
	stID, _ := NewStatementID()
	rawSpace, _ := id.Generate("spc_")
	spaceID := SpaceID(rawSpace)
	accID, _ := NewAccountID()
	now := time.Now().UTC()

	original := &Statement{
		ID:                       stID,
		SpaceID:                  spaceID,
		AccountID:                accID,
		Status:                   StatementStatusInProgress,
		StatementStartingBalance: 1000,
		StatementEndingBalance:   5000,
		StatementDate:            now,
		Filename:                 "old.csv",
		Config:                   StatementConfig{Format: "CSV"},
		RawContent:               "data",
	}

	newEnding := int64(8000)
	incoming := &Statement{
		StatementEndingBalance: newEnding,
	}

	err := original.ApplyPatch(incoming, []string{"statement_ending_balance"})
	if err != nil {
		t.Fatalf("ApplyPatch() error = %v", err)
	}
	if original.StatementEndingBalance != newEnding {
		t.Errorf("StatementEndingBalance = %d, want %d", original.StatementEndingBalance, newEnding)
	}
}

func TestStatementLine_InitAndValidate_Table(t *testing.T) {
	stID, _ := NewStatementID()
	slID, _ := NewStatementLineID()

	t.Run("Init sets defaults", func(t *testing.T) {
		line := &StatementLine{}
		if err := line.Init(stID); err != nil {
			t.Fatalf("Init() error = %v", err)
		}
		if line.ID == "" {
			t.Error("expected non-empty line ID")
		}
		if line.StatementID != stID {
			t.Errorf("StatementID = %s, want %s", line.StatementID, stID)
		}
		if line.Status != StatementLineStatusUnmatched {
			t.Errorf("Status = %s, want %s", line.Status, StatementLineStatusUnmatched)
		}
		if line.Action.Type != StatementLineActionTypePending {
			t.Errorf("Action.Type = %s, want %s", line.Action.Type, StatementLineActionTypePending)
		}
	})

	tests := []struct {
		name    string
		line    StatementLine
		wantErr bool
	}{
		{
			name: "valid line",
			line: StatementLine{
				ID:          slID,
				StatementID: stID,
				RowIndex:    0,
				DateStr:     "2026-08-01",
				Description: "Pharmacy",
				Amount:      -2500,
				Status:      StatementLineStatusUnmatched,
			},
			wantErr: false,
		},
		{
			name: "negative row index",
			line: StatementLine{
				ID:          slID,
				StatementID: stID,
				RowIndex:    -1,
				DateStr:     "2026-08-01",
				Description: "Pharmacy",
				Amount:      -2500,
				Status:      StatementLineStatusUnmatched,
			},
			wantErr: true,
		},
		{
			name: "empty date string",
			line: StatementLine{
				ID:          slID,
				StatementID: stID,
				RowIndex:    0,
				DateStr:     "",
				Description: "Pharmacy",
				Amount:      -2500,
				Status:      StatementLineStatusUnmatched,
			},
			wantErr: true,
		},
		{
			name: "empty description",
			line: StatementLine{
				ID:          slID,
				StatementID: stID,
				RowIndex:    0,
				DateStr:     "2026-08-01",
				Description: "",
				Amount:      -2500,
				Status:      StatementLineStatusUnmatched,
			},
			wantErr: true,
		},
		{
			name: "invalid line status",
			line: StatementLine{
				ID:          slID,
				StatementID: stID,
				RowIndex:    0,
				DateStr:     "2026-08-01",
				Description: "Pharmacy",
				Amount:      -2500,
				Status:      "INVALID",
			},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.line.Validate()
			if (err != nil) != tt.wantErr {
				t.Errorf("StatementLine.Validate() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}

func TestStatementLine_ApplyPatch_Table(t *testing.T) {
	stID, _ := NewStatementID()
	slID, _ := NewStatementLineID()
	txnID, _ := NewTransactionID()

	tests := []struct {
		name       string
		incoming   StatementLine
		mask       []string
		wantStatus StatementLineStatus
		wantTxnID  *TransactionID
	}{
		{
			name: "patch action match sets matched status",
			incoming: StatementLine{
				Action: StatementLineAction{
					Type:          StatementLineActionTypeMatch,
					TransactionID: &txnID,
				},
			},
			mask:       []string{"action"},
			wantStatus: StatementLineStatusMatched,
			wantTxnID:  &txnID,
		},
		{
			name: "patch action skip sets skipped status",
			incoming: StatementLine{
				Action: StatementLineAction{
					Type: StatementLineActionTypeSkip,
				},
			},
			mask:       []string{"action"},
			wantStatus: StatementLineStatusSkipped,
			wantTxnID:  nil,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			line := &StatementLine{
				ID:          slID,
				StatementID: stID,
				RowIndex:    0,
				DateStr:     "2026-08-01",
				Description: "Store",
				Amount:      1000,
				Status:      StatementLineStatusUnmatched,
			}
			err := line.ApplyPatch(&tt.incoming, tt.mask)
			if err != nil {
				t.Fatalf("ApplyPatch() error = %v", err)
			}
			if line.Status != tt.wantStatus {
				t.Errorf("Status = %s, want %s", line.Status, tt.wantStatus)
			}
			if tt.wantTxnID == nil && line.MatchedTransactionID != nil {
				t.Errorf("expected MatchedTransactionID to be nil, got %v", line.MatchedTransactionID)
			}
			if tt.wantTxnID != nil {
				if line.MatchedTransactionID == nil || *line.MatchedTransactionID != *tt.wantTxnID {
					t.Errorf("MatchedTransactionID = %v, want %v", line.MatchedTransactionID, tt.wantTxnID)
				}
			}
		})
	}
}

func TestStatement_ApplyPatch(t *testing.T) {
	stID, _ := NewStatementID()
	spID := SpaceID("spc_2dE1V8ZqWz4eS2N9yX3bL1mK7pO")
	accID, _ := NewAccountID()
	now := time.Now().UTC()

	tests := []struct {
		name     string
		incoming Statement
		mask     []string
		wantErr  bool
	}{
		{
			name: "valid patch updates ending balance",
			incoming: Statement{
				StatementEndingBalance: 50000,
			},
			mask:    []string{"statement_ending_balance"},
			wantErr: false,
		},
		{
			name: "unknown mask field returns error",
			incoming: Statement{
				StatementEndingBalance: 50000,
			},
			mask:    []string{"non_existent_field"},
			wantErr: true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			stmt := &Statement{
				ID:            stID,
				SpaceID:       spID,
				AccountID:     accID,
				Status:        StatementStatusInProgress,
				StatementDate: now,
				Filename:      "stmt.csv",
				Config: StatementConfig{
					Format: "CSV",
				},
				RawContent: "date,desc,amount\n",
			}
			err := stmt.ApplyPatch(&tt.incoming, tt.mask)
			if (err != nil) != tt.wantErr {
				t.Errorf("ApplyPatch() error = %v, wantErr %v", err, tt.wantErr)
			}
		})
	}
}
