package financeapp

import (
	"context"
	"testing"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestCoordinator_StatementOperations(t *testing.T) {
	t.Run("ImportStatement", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			accountID     finance.AccountID
			stmt          *finance.Statement
			mockFn        func(ctx context.Context, accountID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error)
			expectedID    finance.StatementID
			expectedError bool
		}{
			{
				name:      "Success",
				ctx:       newTestContext("spc_1", "usr_1"),
				accountID: "acc_1",
				stmt:      &finance.Statement{Filename: "statement.pdf"},
				mockFn: func(ctx context.Context, accountID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error) {
					if stmt.SpaceID != "spc_1" || accountID != "acc_1" {
						t.Errorf("unexpected import args: space=%v acc=%v", stmt.SpaceID, accountID)
					}
					return &finance.Statement{ID: "stmt_1", SpaceID: stmt.SpaceID}, nil
				},
				expectedID:    "stmt_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				accountID:     "acc_1",
				stmt:          &finance.Statement{},
				expectedError: true,
			},
			{
				name:      "Domain error",
				ctx:       newTestContext("spc_1", "usr_1"),
				accountID: "acc_1",
				stmt:      &finance.Statement{},
				mockFn: func(ctx context.Context, accountID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error) {
					return nil, errors.New("import error")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{ImportStatementFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.ImportStatement(tc.ctx, tc.accountID, tc.stmt)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.ID != tc.expectedID {
					t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
				}
			})
		}
	})

	t.Run("DeleteStatement", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			id            finance.StatementID
			opts          finance.DeleteOptions
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID, opts finance.DeleteOptions) error
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "stmt_1",
				opts: finance.DeleteOptions{Version: 1},
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID, opts finance.DeleteOptions) error {
					if spaceID != "spc_1" || id != "stmt_1" || opts.Version != 1 {
						t.Errorf("unexpected delete args: space=%v id=%v opts=%+v", spaceID, id, opts)
					}
					return nil
				},
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				id:            "stmt_1",
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "stmt_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID, opts finance.DeleteOptions) error {
					return errors.New("delete statement failed")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{DeleteStatementFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				err := coord.DeleteStatement(tc.ctx, tc.id, tc.opts)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})

	t.Run("UpdateStatement", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			stmt          *finance.Statement
			mask          []string
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, stmt *finance.Statement, mask []string) (*finance.Statement, error)
			expectedID    finance.StatementID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				stmt: &finance.Statement{ID: "stmt_1"},
				mask: []string{"ending_balance"},
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, stmt *finance.Statement, mask []string) (*finance.Statement, error) {
					if spaceID != "spc_1" || stmt.ID != "stmt_1" || len(mask) != 1 {
						t.Errorf("unexpected update args: space=%v stmt=%+v mask=%v", spaceID, stmt, mask)
					}
					return &finance.Statement{ID: stmt.ID}, nil
				},
				expectedID:    "stmt_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				stmt:          &finance.Statement{ID: "stmt_1"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				stmt: &finance.Statement{ID: "stmt_1"},
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, stmt *finance.Statement, mask []string) (*finance.Statement, error) {
					return nil, errors.New("update statement error")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{UpdateStatementFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.UpdateStatement(tc.ctx, tc.stmt, tc.mask)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.ID != tc.expectedID {
					t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
				}
			})
		}
	})

	t.Run("UpdateStatementLine", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			line          *finance.StatementLine
			mask          []string
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, line *finance.StatementLine, mask []string) (*finance.StatementLine, error)
			expectedID    finance.StatementLineID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				line: &finance.StatementLine{ID: "line_1"},
				mask: []string{"draft_amount"},
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, line *finance.StatementLine, mask []string) (*finance.StatementLine, error) {
					if spaceID != "spc_1" || line.ID != "line_1" {
						t.Errorf("unexpected update line args: space=%v line=%+v", spaceID, line)
					}
					return &finance.StatementLine{ID: line.ID}, nil
				},
				expectedID:    "line_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				line:          &finance.StatementLine{ID: "line_1"},
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				line: &finance.StatementLine{ID: "line_1"},
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, line *finance.StatementLine, mask []string) (*finance.StatementLine, error) {
					return nil, errors.New("update line error")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{UpdateStatementLineFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.UpdateStatementLine(tc.ctx, tc.line, tc.mask)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.ID != tc.expectedID {
					t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
				}
			})
		}
	})

	t.Run("CompleteStatement", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			id            finance.StatementID
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, error)
			expectedID    finance.StatementID
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "stmt_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, error) {
					if spaceID != "spc_1" || id != "stmt_1" {
						t.Errorf("unexpected complete args: space=%v id=%v", spaceID, id)
					}
					return &finance.Statement{ID: id, Status: finance.StatementStatusCompleted}, nil
				},
				expectedID:    "stmt_1",
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				id:            "stmt_1",
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "stmt_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, error) {
					return nil, errors.New("balance mismatch")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{CompleteStatementFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				res, err := coord.CompleteStatement(tc.ctx, tc.id)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil || res.ID != tc.expectedID {
					t.Errorf("expected ID %v, got %+v", tc.expectedID, res)
				}
			})
		}
	})

	t.Run("InvertStatementSigns", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			id            finance.StatementID
			mockFn        func(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, []*finance.StatementLine, error)
			expectedID    finance.StatementID
			expectedLines int
			expectedError bool
		}{
			{
				name: "Success",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "stmt_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, []*finance.StatementLine, error) {
					if spaceID != "spc_1" || id != "stmt_1" {
						t.Errorf("unexpected invert args: space=%v id=%v", spaceID, id)
					}
					return &finance.Statement{ID: id}, []*finance.StatementLine{{ID: "line_1"}}, nil
				},
				expectedID:    "stmt_1",
				expectedLines: 1,
				expectedError: false,
			},
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				id:            "stmt_1",
				expectedError: true,
			},
			{
				name: "Domain error",
				ctx:  newTestContext("spc_1", "usr_1"),
				id:   "stmt_1",
				mockFn: func(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, []*finance.StatementLine, error) {
					return nil, nil, errors.New("cannot invert finalized statement")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				fsMock := &FinanceServiceMock{InvertStatementSignsFunc: tc.mockFn}
				coord := NewCoordinator(Dependencies{FinanceService: fsMock})
				stmt, lines, err := coord.InvertStatementSigns(tc.ctx, tc.id)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if stmt == nil || stmt.ID != tc.expectedID || len(lines) != tc.expectedLines {
					t.Errorf("unexpected invert result: stmt=%+v, lines=%d", stmt, len(lines))
				}
			})
		}
	})

	t.Run("IngestStatementDocument pipeline guard", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			pipeline      *StatementPipeline
			expectedError bool
		}{
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				pipeline:      &StatementPipeline{},
				expectedError: true,
			},
			{
				name:          "Pipeline not configured",
				ctx:           newTestContext("spc_1", "usr_1"),
				pipeline:      nil,
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					StatementPipeline: tc.pipeline,
				})
				_, err := coord.IngestStatementDocument(tc.ctx, &StatementDocumentRequest{})
				if !tc.expectedError && err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if tc.expectedError && err == nil {
					t.Fatal("expected error, got nil")
				}
			})
		}
	})

	t.Run("AnalyzeStatementDocument pipeline guard", func(t *testing.T) {
		tests := []struct {
			name          string
			ctx           context.Context
			pipeline      *StatementPipeline
			expectedError bool
		}{
			{
				name:          "Unauthenticated",
				ctx:           context.Background(),
				pipeline:      &StatementPipeline{},
				expectedError: true,
			},
			{
				name:          "Pipeline not configured",
				ctx:           newTestContext("spc_1", "usr_1"),
				pipeline:      nil,
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					StatementPipeline: tc.pipeline,
				})
				_, err := coord.AnalyzeStatementDocument(tc.ctx, &StatementDocumentRequest{})
				if !tc.expectedError && err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if tc.expectedError && err == nil {
					t.Fatal("expected error, got nil")
				}
			})
		}
	})
}
