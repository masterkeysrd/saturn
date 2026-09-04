package financeapp

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type mockStatementExtractor struct {
	doc *ParsedStatementDocument
	err error
}

func (m *mockStatementExtractor) Extract(ctx context.Context, spaceID string, docText string, accounts []*finance.Account) (*ParsedStatementDocument, error) {
	if m.err != nil {
		return nil, m.err
	}
	return m.doc, nil
}

type mockFinanceServiceForPipeline struct {
	accounts           []*finance.Account
	importedStatements []*finance.Statement
}

func (m *mockFinanceServiceForPipeline) ConfigureFinance(ctx context.Context, settings *finance.FinanceSettings) (*finance.FinanceSettings, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GetFinanceSettings(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) CreateBudget(ctx context.Context, budget *finance.Budget) (*finance.Budget, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdateBudget(ctx context.Context, budget *finance.Budget, mask []string) (*finance.Budget, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) DeleteBudget(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID, opts finance.DeleteOptions) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) ListBudgets(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) (*paging.Page[*finance.Budget], error) {
	return &paging.Page[*finance.Budget]{}, nil
}
func (m *mockFinanceServiceForPipeline) GetBudget(ctx context.Context, spaceID finance.SpaceID, id finance.BudgetID) (*finance.Budget, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GetOrCreatePeriod(ctx context.Context, spaceID finance.SpaceID, budgetID finance.BudgetID, date time.Time) (*finance.BudgetPeriod, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdatePeriodLimit(ctx context.Context, id finance.PeriodID, limit int64) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) CreateExchangeRate(ctx context.Context, rate *finance.ExchangeRate) (*finance.ExchangeRate, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GetExchangeRateByID(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.ExchangeRate, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdateExchangeRate(ctx context.Context, spaceID finance.SpaceID, id string, rate *finance.ExchangeRate) (*finance.ExchangeRate, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) ListExchangeRates(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error) {
	return nil, "", nil
}
func (m *mockFinanceServiceForPipeline) DeleteExchangeRateByID(ctx context.Context, spaceID finance.SpaceID, id string) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) CreateExpense(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) CreateIncome(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GetTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.TransactionID) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdateExpense(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdateIncome(ctx context.Context, txn *finance.Transaction) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) DeleteTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.TransactionID) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) ListTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.TransactionFilter) (*paging.Page[*finance.Transaction], error) {
	return &paging.Page[*finance.Transaction]{}, nil
}
func (m *mockFinanceServiceForPipeline) ListTransactionEvents(ctx context.Context, spaceID finance.SpaceID, txnID finance.TransactionID) ([]*finance.TransactionEvent, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GetSpentInsights(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.SpentInsights, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GetIncomeInsights(ctx context.Context, req *finance.GetSpentInsightsRequest) (*finance.IncomeInsights, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) CreateRecurringTransaction(ctx context.Context, transaction *finance.RecurringTransaction) (*finance.RecurringTransaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GetRecurringTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.RecurringTransactionID) (*finance.RecurringTransaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdateRecurringTransaction(ctx context.Context, transaction *finance.RecurringTransaction, mask []string) (*finance.RecurringTransaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) DeleteRecurringTransaction(ctx context.Context, id finance.RecurringTransactionID, opts finance.DeleteOptions) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) ListRecurringTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListRecurringTransactionsFilter) (*paging.Page[*finance.RecurringTransaction], error) {
	return &paging.Page[*finance.RecurringTransaction]{}, nil
}
func (m *mockFinanceServiceForPipeline) ListScheduledTransactions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListScheduledTransactionsFilter) (*paging.Page[*finance.ScheduledTransaction], error) {
	return &paging.Page[*finance.ScheduledTransaction]{}, nil
}
func (m *mockFinanceServiceForPipeline) GetScheduledTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) ConfirmScheduledTransaction(ctx context.Context, req finance.ConfirmScheduledTransactionRequest) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) MatchScheduledTransaction(ctx context.Context, req finance.MatchScheduledTransactionRequest) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) SkipScheduledTransaction(ctx context.Context, spaceID finance.SpaceID, id finance.ScheduledTransactionID) (*finance.ScheduledTransaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GenerateScheduledTransactions(ctx context.Context) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) CreateBorrowing(ctx context.Context, b *finance.Borrowing, createAsTransaction bool) (*finance.Borrowing, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GetBorrowing(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingID) (*finance.Borrowing, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) ListBorrowings(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBorrowingsFilter) ([]*finance.Borrowing, string, error) {
	return nil, "", nil
}
func (m *mockFinanceServiceForPipeline) UpdateBorrowing(ctx context.Context, b *finance.Borrowing, mask []string) (*finance.Borrowing, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) DeleteBorrowing(ctx context.Context, spaceID finance.SpaceID, id finance.BorrowingID) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) LogBorrowingTransaction(ctx context.Context, req finance.LogBorrowingTransactionRequest) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdateBorrowingTransaction(ctx context.Context, req finance.UpdateBorrowingTransactionRequest) (*finance.Transaction, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) DeleteBorrowingTransaction(ctx context.Context, req finance.DeleteBorrowingTransactionRequest) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) AdjustBorrowingBalance(ctx context.Context, req finance.AdjustBorrowingBalanceRequest) (*finance.Borrowing, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) ListCurrencies(ctx context.Context) ([]finance.CurrencyInfo, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) CreateAccount(ctx context.Context, account *finance.Account) (*finance.Account, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GetAccount(ctx context.Context, spaceID finance.SpaceID, id finance.AccountID) (*finance.Account, error) {
	for _, a := range m.accounts {
		if a.ID == id {
			return a, nil
		}
	}
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdateAccount(ctx context.Context, account *finance.Account, mask []string) (*finance.Account, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) AdjustAccountBalance(ctx context.Context, spaceID finance.SpaceID, accountID finance.AccountID, targetBalance int64, adjustmentDate string, note string) (*finance.Account, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) DeleteAccount(ctx context.Context, spaceID finance.SpaceID, id finance.AccountID, opts finance.DeleteOptions) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) ListAccounts(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListAccountsFilter) (*paging.Page[*finance.Account], error) {
	return &paging.Page[*finance.Account]{Items: m.accounts}, nil
}
func (m *mockFinanceServiceForPipeline) ResolveAccount(ctx context.Context, spaceID finance.SpaceID, opts finance.ResolveAccountOpts) (*finance.Account, error) {
	for _, a := range m.accounts {
		if opts.Currency != "" && string(a.Currency) != opts.Currency {
			continue
		}
		if opts.LastFour != "" && a.LastFour != opts.LastFour {
			continue
		}
		return a, nil
	}
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) CreateTransfer(ctx context.Context, transfer *finance.Transfer) (*finance.Transfer, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) GetTransfer(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) (*finance.Transfer, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) DeleteTransfer(ctx context.Context, spaceID finance.SpaceID, id finance.TransferID) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) ListTransfers(ctx context.Context, spaceID finance.SpaceID, limit int32, pageToken string) ([]*finance.Transfer, string, error) {
	return nil, "", nil
}
func (m *mockFinanceServiceForPipeline) StageInboxItem(ctx context.Context, spaceID finance.SpaceID, req *finance.StageInboxItem) (*finance.InboxItem, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdateInboxItem(ctx context.Context, spaceID finance.SpaceID, item *finance.InboxItem) (*finance.InboxItem, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) DiscardInboxItem(ctx context.Context, spaceID finance.SpaceID, id string) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) ApproveInboxItem(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.InboxItem, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) CreateInstitution(ctx context.Context, inst *finance.Institution) (*finance.Institution, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdateInstitution(ctx context.Context, inst *finance.Institution, mask []string) (*finance.Institution, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) DeleteInstitution(ctx context.Context, spaceID finance.SpaceID, id finance.InstitutionID, opts finance.DeleteOptions) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) ResolveInstitution(ctx context.Context, spaceID finance.SpaceID, name string) (*finance.ResolveInstitutionResult, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) ListInstitutions(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListInstitutionsFilter) (*paging.Page[*finance.Institution], error) {
	return &paging.Page[*finance.Institution]{}, nil
}
func (m *mockFinanceServiceForPipeline) ImportStatement(ctx context.Context, accountID finance.AccountID, stmt *finance.Statement) (*finance.Statement, error) {
	m.importedStatements = append(m.importedStatements, stmt)
	return stmt, nil
}
func (m *mockFinanceServiceForPipeline) DeleteStatement(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID, opts finance.DeleteOptions) error {
	return nil
}
func (m *mockFinanceServiceForPipeline) UpdateStatement(ctx context.Context, spaceID finance.SpaceID, stmt *finance.Statement, mask []string) (*finance.Statement, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) UpdateStatementLine(ctx context.Context, spaceID finance.SpaceID, line *finance.StatementLine, mask []string) (*finance.StatementLine, error) {
	return nil, nil
}
func (m *mockFinanceServiceForPipeline) CompleteStatement(ctx context.Context, spaceID finance.SpaceID, id finance.StatementID) (*finance.Statement, error) {
	return nil, nil
}

func TestStatementPipeline_AnalyzeDocument_MultiCurrencyAndMathValidation(t *testing.T) {
	mockFS := &mockFinanceServiceForPipeline{
		accounts: []*finance.Account{
			{
				ID:       "acc_dop123",
				Name:     "Visa Platinum (DOP)",
				Type:     finance.AccountTypeCreditCard,
				Currency: "DOP",
				LastFour: "1234",
			},
			{
				ID:       "acc_usd123",
				Name:     "Visa Platinum (USD)",
				Type:     finance.AccountTypeCreditCard,
				Currency: "USD",
				LastFour: "1234",
			},
		},
	}

	mockExt := &mockStatementExtractor{
		doc: &ParsedStatementDocument{
			InstitutionName: "Example Bank",
			CardLastFour:    "1234",
			StatementDate:   "2026-08-15",
			Sections: []ParsedStatementSection{
				{
					Currency:        "DOP",
					StartingBalance: 100000, // 1,000.00 DOP
					EndingBalance:   70000,  // 700.00 DOP
					Lines: []ParsedStatementLine{
						{DateStr: "2026-08-01", Description: "Supermarket", Amount: -50000},     // -500.00
						{DateStr: "2026-08-05", Description: "Payment Received", Amount: 20000}, // +200.00
						// Net flow = -300.00 (-30000 cents). Starting 100000 - 30000 = 70000. Exactly matches EndingBalance!
					},
				},
				{
					Currency:        "USD",
					StartingBalance: 5000, // 50.00 USD
					EndingBalance:   8000, // 80.00 USD
					Lines: []ParsedStatementLine{
						{DateStr: "2026-08-02", Description: "Netflix", Amount: -1500}, // -15.00
						// Net flow = -1500. Starting 5000 - 1500 = 3500. Ending is 8000. Discrepancy = 8000 - 3500 = 4500!
					},
				},
			},
		},
	}

	pipeline := NewStatementPipeline(StatementPipelineDependencies{
		FinanceService: mockFS,
		Extractor:      mockExt,
	})

	ctx := context.Background()
	req := &StatementDocumentRequest{
		Filename:      "statement.txt",
		ContentType:   "text/plain",
		DocumentBytes: []byte("Example Bank Statement August 2026"),
	}

	// 1. Analyze Document (Dry-run / Preview)
	state, err := pipeline.AnalyzeDocument(ctx, "spc_test123", req)
	if err != nil {
		t.Fatalf("AnalyzeDocument failed: %v", err)
	}

	if len(state.SectionReports) != 2 {
		t.Fatalf("expected 2 section reports, got %d", len(state.SectionReports))
	}

	// Verify DOP section math (Balanced)
	dopReport := state.SectionReports[0]
	if dopReport.Currency != "DOP" {
		t.Errorf("expected first section DOP, got %s", dopReport.Currency)
	}
	if !dopReport.IsBalanced {
		t.Errorf("expected DOP section to be balanced, discrepancy=%d", dopReport.Discrepancy)
	}
	if dopReport.Discrepancy != 0 {
		t.Errorf("expected discrepancy 0, got %d", dopReport.Discrepancy)
	}

	// Verify USD section math (Unbalanced)
	usdReport := state.SectionReports[1]
	if usdReport.Currency != "USD" {
		t.Errorf("expected second section USD, got %s", usdReport.Currency)
	}
	if usdReport.IsBalanced {
		t.Errorf("expected USD section to be unbalanced")
	}
	if usdReport.Discrepancy != 4500 {
		t.Errorf("expected USD discrepancy 4500 cents, got %d", usdReport.Discrepancy)
	}

	// Verify Account Resolution
	if state.AccountMappings["DOP"] == nil || state.AccountMappings["DOP"].ID != "acc_dop123" {
		t.Errorf("expected DOP account mapped to acc_dop123, got %v", state.AccountMappings["DOP"])
	}
	if state.AccountMappings["USD"] == nil || state.AccountMappings["USD"].ID != "acc_usd123" {
		t.Errorf("expected USD account mapped to acc_usd123, got %v", state.AccountMappings["USD"])
	}

	// 2. Ingest Document (Persistence outside the graph)
	ingestRes, err := pipeline.IngestDocument(ctx, "spc_test123", req)
	if err != nil {
		t.Fatalf("IngestDocument failed: %v", err)
	}

	if len(ingestRes.CreatedStatements) != 2 {
		t.Fatalf("expected 2 created statements, got %d", len(ingestRes.CreatedStatements))
	}
	if ingestRes.BatchID == "" {
		t.Error("expected non-empty BatchID")
	}

	if len(mockFS.importedStatements) != 2 {
		t.Fatalf("expected 2 imported statements in DB, got %d", len(mockFS.importedStatements))
	}
}

func TestGenerateStandardizedCSV(t *testing.T) {
	lines := []ParsedStatementLine{
		{
			DateStr:     "2026-08-12",
			Description: "WHOLE FOODS MARKET",
			Amount:      -4550,
			Reference:   nil,
		},
		{
			DateStr:     "2026-08-14",
			Description: "SALARY DEPOSIT",
			Amount:      250000,
			Reference:   stringPtr("REF-8899"),
		},
	}

	csvStr, err := generateStandardizedCSV(lines)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if !strings.Contains(csvStr, "Date,Description,Amount,Reference") {
		t.Error("expected CSV header")
	}
	if !strings.Contains(csvStr, "2026-08-12,WHOLE FOODS MARKET,-45.50,") {
		t.Errorf("expected formatted expense line, got: %s", csvStr)
	}
	if !strings.Contains(csvStr, "2026-08-14,SALARY DEPOSIT,2500.00,REF-8899") {
		t.Errorf("expected formatted income line, got: %s", csvStr)
	}
}

func TestStatementPipeline_CreditCardDualCurrencyLiability(t *testing.T) {
	ctx := context.Background()

	cardDOP := &finance.Account{
		ID:       "acc_card_dop",
		Name:     "Credit Card (DOP)",
		Type:     finance.AccountTypeCreditCard,
		LastFour: "9988",
		Currency: "DOP",
	}
	cardUSD := &finance.Account{
		ID:       "acc_card_usd",
		Name:     "Credit Card (USD)",
		Type:     finance.AccountTypeCreditCard,
		LastFour: "9988",
		Currency: "USD",
	}
	checkingDOP := &finance.Account{
		ID:       "acc_checking_dop",
		Name:     "Checking Account (DOP)",
		Type:     finance.AccountTypeBank,
		LastFour: "1122",
		Currency: "DOP",
	}

	extractor := &mockStatementExtractor{
		doc: &ParsedStatementDocument{
			InstitutionName: "Example National Bank",
			CardLastFour:    "9988",
			StatementDate:   "2026-08-17",
			Sections: []ParsedStatementSection{
				{
					Currency:           "DOP",
					CardLastFour:       "9988",
					SuggestedAccountID: "acc_card_dop",
					StartingBalance:    1510781, // 15,107.81 on paper
					EndingBalance:      3366924, // 33,669.24 on paper
					Lines: []ParsedStatementLine{
						{DateStr: "2026-07-15", Description: "ONLINE PAYMENT", Amount: 1510781, Reference: stringPtr("0001")},
						{DateStr: "2026-07-20", Description: "ONLINE RETAILER", Amount: -477947, Reference: stringPtr("9988")},
						{DateStr: "2026-07-25", Description: "FUEL STATION", Amount: -517090, Reference: stringPtr("9988")},
						{DateStr: "2026-08-04", Description: "ONLINE PAYMENT", Amount: 2260150, Reference: stringPtr("0001")},
						{DateStr: "2026-08-07", Description: "MEDICAL CLINIC", Amount: -1200000, Reference: stringPtr("9988")},
						{DateStr: "2026-08-09", Description: "DEPARTMENT STORE", Amount: -518609, Reference: stringPtr("9988")},
						{DateStr: "2026-08-04", Description: "PAYMENT SERVICE", Amount: -773900, Reference: stringPtr("9988")},
						{DateStr: "2026-08-06", Description: "PAYMENT SERVICE", Amount: -440178, Reference: stringPtr("9988")},
						{DateStr: "2026-08-13", Description: "PAYMENT SERVICE", Amount: -396395, Reference: stringPtr("9988")},
						{DateStr: "2026-08-15", Description: "ENTERTAINMENT PARK", Amount: -558000, Reference: stringPtr("9988")},
						{DateStr: "2026-08-15", Description: "ENTERTAINMENT PARK", Amount: -174347, Reference: stringPtr("9988")},
						{DateStr: "2026-07-30", Description: "PAYMENT SERVICE", Amount: -270113, Reference: stringPtr("9988")},
						{DateStr: "2026-08-01", Description: "SHIPPING SERVICE", Amount: -120300, Reference: stringPtr("9988")},
						{DateStr: "2026-08-02", Description: "RESTAURANT DINE", Amount: -67500, Reference: stringPtr("9988")},
						{DateStr: "2026-08-03", Description: "STREAMING SERVICE", Amount: -33300, Reference: stringPtr("9988")},
						{DateStr: "2026-08-09", Description: "SUPERMARKET GROCERY", Amount: -71405, Reference: stringPtr("9988")},
						{DateStr: "2026-08-11", Description: "ONLINE RETAILER", Amount: -7990, Reference: stringPtr("9988")},
					},
				},
				{
					Currency:           "USD",
					CardLastFour:       "9988",
					SuggestedAccountID: "acc_card_usd",
					StartingBalance:    58065,  // 580.65 on paper
					EndingBalance:      194900, // 1,949.00 on paper
					Lines: []ParsedStatementLine{
						{DateStr: "2026-07-15", Description: "ONLINE PAYMENT", Amount: 58065, Reference: stringPtr("0002")},
						{DateStr: "2026-07-31", Description: "ONLINE PAYMENT", Amount: 77904, Reference: stringPtr("0002")},
						{DateStr: "2026-08-11", Description: "PROMOTION CREDIT", Amount: 556, Reference: stringPtr("0002")},
						{DateStr: "2026-07-15", Description: "CLOUD AI API", Amount: -5000, Reference: stringPtr("9988")},
						{DateStr: "2026-07-21", Description: "DNS HOSTING", Amount: -1220, Reference: stringPtr("9988")},
						{DateStr: "2026-07-23", Description: "MUSIC STREAMING", Amount: -649, Reference: stringPtr("9988")},
						{DateStr: "2026-07-26", Description: "AIRLINE TICKET", Amount: -69237, Reference: stringPtr("9988")},
						{DateStr: "2026-07-29", Description: "VIDEO STREAMING", Amount: -1798, Reference: stringPtr("9988")},
						{DateStr: "2026-08-01", Description: "CLOUD HOSTING", Amount: -195, Reference: stringPtr("9988")},
						{DateStr: "2026-08-04", Description: "CLOUD HOSTING", Amount: -5000, Reference: stringPtr("9988")},
						{DateStr: "2026-08-04", Description: "ONLINE MARKETPLACE", Amount: -160499, Reference: stringPtr("9988")},
						{DateStr: "2026-08-05", Description: "ONLINE MARKETPLACE", Amount: -999, Reference: stringPtr("9988")},
						{DateStr: "2026-08-07", Description: "STREAMING SERVICE", Amount: -1599, Reference: stringPtr("9988")},
						{DateStr: "2026-08-04", Description: "ONLINE MARKETPLACE", Amount: -2828, Reference: stringPtr("9988")},
						{DateStr: "2026-08-08", Description: "CODE HOSTING", Amount: -3900, Reference: stringPtr("9988")},
						{DateStr: "2026-08-12", Description: "PRIME MEMBERSHIP", Amount: -1516, Reference: stringPtr("9988")},
						{DateStr: "2026-08-14", Description: "VACATION RENTAL", Amount: -6500, Reference: stringPtr("9988")},
						{DateStr: "2026-08-14", Description: "HOTEL LODGING", Amount: -12420, Reference: stringPtr("9988")},
					},
				},
				{
					// Empty installment section with 0 balances and 0 lines
					Currency:        "DOP",
					StartingBalance: 0,
					EndingBalance:   0,
					Lines:           []ParsedStatementLine{},
				},
			},
		},
	}

	finService := &mockFinanceServiceForPipeline{
		accounts: []*finance.Account{cardDOP, cardUSD, checkingDOP},
	}

	pipeline := NewStatementPipeline(StatementPipelineDependencies{
		FinanceService: finService,
		Extractor:      extractor,
	})

	res, err := pipeline.IngestDocument(ctx, "spc_123", &StatementDocumentRequest{
		Filename:      "statement.txt",
		ContentType:   "text/plain",
		DocumentBytes: []byte("Sample statement document text"),
	})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// 1. Exactly 2 statements created (empty installment section ignored)
	if len(res.CreatedStatements) != 2 {
		t.Fatalf("expected 2 created statements, got %d", len(res.CreatedStatements))
	}

	// 2. Both DOP and USD must be balanced
	for _, report := range res.SectionReports {
		if !report.IsBalanced {
			t.Errorf("expected section %s to be balanced, discrepancy: %d (calcEnding: %d, ending: %d)",
				report.Currency, report.Discrepancy, report.CalculatedEnding, report.EndingBalance)
		}
	}

	// 3. Verify accounts mapped correctly (Credit Card 9988, NOT Checking Account)
	stmtDOP := res.CreatedStatements[0]
	if stmtDOP.AccountID != "acc_card_dop" {
		t.Errorf("expected DOP statement mapped to acc_card_dop, got %s", stmtDOP.AccountID)
	}
	if stmtDOP.StatementStartingBalance != -1510781 {
		t.Errorf("expected liability starting balance -1510781, got %d", stmtDOP.StatementStartingBalance)
	}
	if stmtDOP.StatementEndingBalance != -3366924 {
		t.Errorf("expected liability ending balance -3366924, got %d", stmtDOP.StatementEndingBalance)
	}

	stmtUSD := res.CreatedStatements[1]
	if stmtUSD.AccountID != "acc_card_usd" {
		t.Errorf("expected USD statement mapped to acc_card_usd, got %s", stmtUSD.AccountID)
	}
	if stmtUSD.StatementStartingBalance != -58065 {
		t.Errorf("expected liability starting balance -58065, got %d", stmtUSD.StatementStartingBalance)
	}
	if stmtUSD.StatementEndingBalance != -194900 {
		t.Errorf("expected liability ending balance -194900, got %d", stmtUSD.StatementEndingBalance)
	}
}

func stringPtr(s string) *string {
	return &s
}
