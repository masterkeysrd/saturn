package driver

import (
	"strings"
	"testing"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/masterkeysrd/saturn/apis/saturn"
	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
)

// ExpenseOptions encapsulates parameters for logging an expense transaction.
type ExpenseOptions struct {
	Account     string
	Budget      string
	Currency    string
	Amount      int64
	Description string
	ExpectErr   string
}

// BudgetDeleteOptions encapsulates options for deleting a budget.
type BudgetDeleteOptions struct {
	Budget    string
	ExpectErr string
}

// RepaymentOptions encapsulates options for creating a borrowing repayment.
type RepaymentOptions struct {
	Borrowing string // Name/alias of borrowing
	Account   string // Name/alias of payment account
	Amount    int64  // Repayment amount in borrowing currency cents
	Notes     string // Optional notes
}

// FinanceDriver provides fluent methods for finance domain operations using financev1.Client SDK.
type FinanceDriver struct {
	driver      *Driver
	client      *financev1.Client
	lastToken   string
	lastSpaceID string
}

func (f *FinanceDriver) getClient() *financev1.Client {
	if f.client == nil || f.lastToken != f.driver.state.AccessToken || f.lastSpaceID != f.driver.state.SpaceID {
		f.lastToken = f.driver.state.AccessToken
		f.lastSpaceID = f.driver.state.SpaceID
		f.client = financev1.NewClient(saturn.Config{
			BaseURL:     f.driver.env.ServerURL,
			AccessToken: f.lastToken,
			SpaceID:     f.lastSpaceID,
			HTTPClient:  f.driver.httpClient,
		})
	}
	return f.client
}

// InitSettings initializes workspace finance settings with a base currency.
func (f *FinanceDriver) InitSettings(tb testing.TB, baseCurrency string) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	_, err := client.ConfigureFinance(tb.Context(), &financev1.ConfigureFinanceRequest{
		BaseCurrency: baseCurrency,
	})
	if err != nil {
		tb.Fatalf("ConfigureFinance SDK call failed: %v", err)
	}
	return f
}

// CreateAccount creates a financial account using financev1.Client.
func (f *FinanceDriver) CreateAccount(tb testing.TB, accountName, accountType, currency string, initialBalance int64) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	acc, err := client.CreateAccount(tb.Context(), &financev1.CreateAccountRequest{
		Account: &financev1.Account{
			Name:           accountName,
			Type:           parseAccountType(accountType),
			Currency:       currency,
			InitialBalance: initialBalance,
		},
	})
	if err != nil {
		tb.Fatalf("CreateAccount SDK call failed: %v", err)
		return f
	}

	accInfo := &AccountInfo{
		ID:             acc.GetId(),
		Name:           accountName,
		Type:           accountType,
		Currency:       currency,
		InitialBalance: initialBalance,
	}
	f.driver.state.Accounts[accountName] = accInfo
	f.driver.state.LastAccount = accInfo
	return f
}

// CreateBorrowing creates a borrowing agreement using financev1.Client.
func (f *FinanceDriver) CreateBorrowing(tb testing.TB, borrowingName, counterparty, direction, currency string, totalAmount int64) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	bor, err := client.CreateBorrowing(tb.Context(), &financev1.CreateBorrowingRequest{
		Borrowing: &financev1.Borrowing{
			Counterparty: counterparty,
			Direction:    parseBorrowingDirection(direction),
			Currency:     currency,
			TotalAmount:  totalAmount,
		},
	})
	if err != nil {
		tb.Fatalf("CreateBorrowing SDK call failed: %v", err)
		return f
	}

	borInfo := &BorrowingInfo{
		ID:           bor.GetId(),
		Counterparty: counterparty,
		Direction:    direction,
		Currency:     currency,
		TotalAmount:  totalAmount,
	}
	f.driver.state.Borrowings[borrowingName] = borInfo
	f.driver.state.LastBorrowing = borInfo
	return f
}

// CreateRepayment creates a repayment against an existing borrowing agreement using financev1.Client.
func (f *FinanceDriver) CreateRepayment(tb testing.TB, opts RepaymentOptions) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	bor, ok := f.driver.state.Borrowings[opts.Borrowing]
	if !ok {
		tb.Fatalf("borrowing named %q not found in state registry", opts.Borrowing)
		return f
	}
	acc, ok := f.driver.state.Accounts[opts.Account]
	if !ok {
		tb.Fatalf("account named %q not found in state registry", opts.Account)
		return f
	}

	client := f.getClient()
	rep, err := client.CreateBorrowingRepayment(tb.Context(), &financev1.CreateBorrowingRepaymentRequest{
		BorrowingId: bor.ID,
		Repayment: &financev1.BorrowingRepayment{
			Amount:    opts.Amount,
			AccountId: acc.ID,
			Notes:     opts.Notes,
		},
	})
	if err != nil {
		tb.Fatalf("CreateBorrowingRepayment SDK call failed: %v", err)
		return f
	}

	repKey := opts.Borrowing + "_repayment"
	repInfo := &RepaymentInfo{
		ID:          rep.GetId(),
		BorrowingID: bor.ID,
		AccountID:   acc.ID,
		Amount:      opts.Amount,
	}
	f.driver.state.Repayments[repKey] = repInfo
	f.driver.state.LastRepayment = repInfo
	return f
}

// DeleteRepayment deletes a borrowing repayment using financev1.Client.
func (f *FinanceDriver) DeleteRepayment(tb testing.TB, repaymentKey string) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	rep, ok := f.driver.state.Repayments[repaymentKey]
	if !ok {
		tb.Fatalf("repayment key %q not found in state registry", repaymentKey)
		return f
	}

	client := f.getClient()
	_, err := client.DeleteTransaction(tb.Context(), &financev1.DeleteTransactionRequest{
		Id: rep.ID,
	})
	if err != nil {
		tb.Fatalf("DeleteTransaction SDK call failed for repayment: %v", err)
		return f
	}

	delete(f.driver.state.Repayments, repaymentKey)
	return f
}

// AssertAccountBalance verifies that a named financial account matches expected balance.
func (f *FinanceDriver) AssertAccountBalance(tb testing.TB, accountName string, expectedBalance int64) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	accInfo, ok := f.driver.state.Accounts[accountName]
	if !ok {
		tb.Fatalf("account named %q not found in state registry", accountName)
		return f
	}

	client := f.getClient()
	resp, err := client.ListAccounts(tb.Context(), &financev1.ListAccountsRequest{})
	if err != nil {
		tb.Fatalf("ListAccounts SDK call failed: %v", err)
		return f
	}

	var foundAcc *financev1.Account
	for _, acc := range resp.GetAccounts() {
		if acc.GetId() == accInfo.ID {
			foundAcc = acc
			break
		}
	}

	if foundAcc == nil {
		tb.Fatalf("account %q with ID %s not found in ListAccounts response", accountName, accInfo.ID)
		return f
	}

	if foundAcc.GetCurrentBalance() != expectedBalance {
		tb.Errorf("Account %q balance = %d, want %d", accountName, foundAcc.GetCurrentBalance(), expectedBalance)
	}
	return f
}

// AssertBorrowingBalance verifies that a named borrowing agreement matches expected remaining balance.
func (f *FinanceDriver) AssertBorrowingBalance(tb testing.TB, borrowingName string, expectedRemaining int64) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	borInfo, ok := f.driver.state.Borrowings[borrowingName]
	if !ok {
		tb.Fatalf("borrowing named %q not found in state registry", borrowingName)
		return f
	}

	client := f.getClient()
	resp, err := client.ListBorrowings(tb.Context(), &financev1.ListBorrowingsRequest{})
	if err != nil {
		tb.Fatalf("ListBorrowings SDK call failed: %v", err)
		return f
	}

	var foundBor *financev1.Borrowing
	for _, bor := range resp.GetBorrowings() {
		if bor.GetId() == borInfo.ID {
			foundBor = bor
			break
		}
	}

	if foundBor == nil {
		tb.Fatalf("borrowing %q with ID %s not found in ListBorrowings response", borrowingName, borInfo.ID)
		return f
	}

	if foundBor.GetRemainingAmount() != expectedRemaining {
		tb.Errorf("Borrowing %q remaining balance = %d, want %d", borrowingName, foundBor.GetRemainingAmount(), expectedRemaining)
	}
	return f
}

// AssertRepaymentTransaction verifies that a transaction event was logged for a repayment.
func (f *FinanceDriver) AssertRepaymentTransaction(tb testing.TB, repaymentKey string, expectedAmount int64) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	rep, ok := f.driver.state.Repayments[repaymentKey]
	if !ok {
		tb.Fatalf("repayment key %q not found in state registry", repaymentKey)
		return f
	}

	client := f.getClient()
	resp, err := client.ListTransactions(tb.Context(), &financev1.ListTransactionsRequest{})
	if err != nil {
		tb.Fatalf("ListTransactions SDK call failed: %v", err)
		return f
	}

	var foundTx *financev1.Transaction
	for _, tx := range resp.GetTransactions() {
		if tx.GetId() == rep.ID {
			foundTx = tx
			break
		}
	}

	if foundTx == nil {
		tb.Fatalf("transaction with ID %s for repayment %q not found in ListTransactions response", rep.ID, repaymentKey)
		return f
	}

	if foundTx.GetAmount() != expectedAmount {
		tb.Errorf("Transaction for repayment %q amount = %d, want %d", repaymentKey, foundTx.GetAmount(), expectedAmount)
	}
	return f
}

// AssertTransactionCount verifies the total number of logged transactions in the space.
func (f *FinanceDriver) AssertTransactionCount(tb testing.TB, expectedCount int) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	resp, err := client.ListTransactions(tb.Context(), &financev1.ListTransactionsRequest{})
	if err != nil {
		tb.Fatalf("ListTransactions SDK call failed: %v", err)
		return f
	}

	count := len(resp.GetTransactions())
	if count != expectedCount {
		tb.Errorf("Transaction count = %d, want %d", count, expectedCount)
	}
	return f
}

// CreateTransfer executes an internal account transfer between two named accounts.
func (f *FinanceDriver) CreateTransfer(tb testing.TB, fromAccountName, toAccountName string, amount int64, notes string) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	srcAcc, ok := f.driver.state.Accounts[fromAccountName]
	if !ok {
		tb.Fatalf("account named %q not found in state registry", fromAccountName)
		return f
	}
	dstAcc, ok := f.driver.state.Accounts[toAccountName]
	if !ok {
		tb.Fatalf("account named %q not found in state registry", toAccountName)
		return f
	}

	client := f.getClient()
	_, err := client.CreateTransfer(tb.Context(), &financev1.CreateTransferRequest{
		SourceAccountId:      srcAcc.ID,
		DestinationAccountId: dstAcc.ID,
		SourceAmount:         amount,
		DestinationAmount:    amount,
		Notes:                notes,
	})
	if err != nil {
		tb.Fatalf("CreateTransfer SDK call failed: %v", err)
	}
	return f
}

// CreateBudget creates a budget category definition and registers it in state.
func (f *FinanceDriver) CreateBudget(tb testing.TB, budgetName string, limitAmount int64, currency string) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	bud, err := client.CreateBudget(tb.Context(), &financev1.CreateBudgetRequest{
		Budget: &financev1.Budget{
			Name:        budgetName,
			LimitAmount: limitAmount,
			Currency:    currency,
			Interval:    financev1.Budget_MONTHLY,
			IsActive:    true,
		},
	})
	if err != nil {
		tb.Fatalf("CreateBudget SDK call failed: %v", err)
		return f
	}

	f.driver.state.Budgets[budgetName] = bud.GetId()
	return f
}

// CreateExpense logs an expense transaction using ExpenseOptions struct.
func (f *FinanceDriver) CreateExpense(tb testing.TB, opts ExpenseOptions) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	acc, ok := f.driver.state.Accounts[opts.Account]
	if !ok {
		tb.Fatalf("account named %q not found in state registry", opts.Account)
		return f
	}
	budID, ok := f.driver.state.Budgets[opts.Budget]
	if !ok {
		tb.Fatalf("budget named %q not found in state registry", opts.Budget)
		return f
	}

	currency := opts.Currency
	if currency == "" {
		currency = acc.Currency
	}

	client := f.getClient()
	_, err := client.CreateExpense(tb.Context(), &financev1.CreateExpenseRequest{
		Expense: &financev1.ExpenseInput{
			BudgetId:    budID,
			Amount:      opts.Amount,
			Currency:    currency,
			Description: opts.Description,
			AccountId:   &acc.ID,
		},
	})

	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("CreateExpense succeeded, but expected error containing %q", opts.ExpectErr)
			return f
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateExpense error = %v, want error containing %q", err, opts.ExpectErr)
			return f
		}
		return f
	}

	if err != nil {
		tb.Fatalf("CreateExpense SDK call failed: %v", err)
	}
	return f
}

// AssertBudgetProgress verifies the spent and remaining amounts of a named budget.
func (f *FinanceDriver) AssertBudgetProgress(tb testing.TB, budgetName string, expectedSpent, expectedRemaining int64) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	budID, ok := f.driver.state.Budgets[budgetName]
	if !ok {
		tb.Fatalf("budget named %q not found in state registry", budgetName)
		return f
	}

	client := f.getClient()
	viewFull := financev1.Budget_FULL
	resp, err := client.ListBudgets(tb.Context(), &financev1.ListBudgetsRequest{
		View: &viewFull,
	})
	if err != nil {
		tb.Fatalf("ListBudgets SDK call failed: %v", err)
		return f
	}

	var targetBud *financev1.Budget
	for _, b := range resp.GetBudgets() {
		if b.GetId() == budID {
			targetBud = b
			break
		}
	}

	if targetBud == nil {
		tb.Fatalf("budget %q with ID %s not found in ListBudgets response", budgetName, budID)
		return f
	}

	curPeriod := targetBud.GetCurrentPeriod()
	if curPeriod == nil {
		tb.Fatalf("budget %q has no active period info", budgetName)
		return f
	}

	remaining := targetBud.GetLimitAmount() - curPeriod.GetSpentAmount()
	if curPeriod.GetSpentAmount() != expectedSpent {
		tb.Errorf("Budget %q spent = %d, want %d", budgetName, curPeriod.GetSpentAmount(), expectedSpent)
	}
	if remaining != expectedRemaining {
		tb.Errorf("Budget %q remaining = %d, want %d", budgetName, remaining, expectedRemaining)
	}
	return f
}

// DeleteBudget deletes a budget category or asserts failure if ExpectErr is set.
func (f *FinanceDriver) DeleteBudget(tb testing.TB, opts BudgetDeleteOptions) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	budID, ok := f.driver.state.Budgets[opts.Budget]
	if !ok {
		tb.Fatalf("budget named %q not found in state registry", opts.Budget)
		return f
	}

	client := f.getClient()
	_, err := client.DeleteBudget(tb.Context(), &financev1.DeleteBudgetRequest{
		Id: budID,
	})

	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("DeleteBudget succeeded, but expected error containing %q", opts.ExpectErr)
			return f
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("DeleteBudget error = %v, want error containing %q", err, opts.ExpectErr)
			return f
		}
		return f
	}

	if err != nil {
		tb.Fatalf("DeleteBudget SDK call failed: %v", err)
		return f
	}

	delete(f.driver.state.Budgets, opts.Budget)
	return f
}

// CreateRecurringExpense creates a recurring expense subscription linked to a named budget.
func (f *FinanceDriver) CreateRecurringExpense(tb testing.TB, expenseName, budgetName string, amount int64, currency string) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	budID, ok := f.driver.state.Budgets[budgetName]
	if !ok {
		tb.Fatalf("budget named %q not found in state registry", budgetName)
		return f
	}

	client := f.getClient()
	_, err := client.CreateRecurringExpense(tb.Context(), &financev1.CreateRecurringExpenseRequest{
		RecurringExpense: &financev1.RecurringExpense{
			Name:     expenseName,
			BudgetId: budID,
			Amount:   amount,
			Currency: currency,
			Interval: financev1.RecurringExpense_MONTHLY,
			Status:   financev1.RecurringExpense_ACTIVE,
			ExecutionState: &financev1.RecurringExpense_ExecutionState{
				NextDueDate: timestamppb.New(time.Now().AddDate(0, 1, 0)),
			},
		},
	})
	if err != nil {
		tb.Fatalf("CreateRecurringExpense SDK call failed: %v", err)
	}
	return f
}

// CreateExchangeRate registers an exchange rate conversion pair.
func (f *FinanceDriver) CreateExchangeRate(tb testing.TB, fromCurrency, toCurrency string, rate float64) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	_, err := client.CreateExchangeRate(tb.Context(), &financev1.CreateExchangeRateRequest{
		ExchangeRate: &financev1.ExchangeRate{
			FromCurrency: fromCurrency,
			ToCurrency:   toCurrency,
			Rate:         rate,
			RateDate:     timestamppb.Now(),
		},
	})
	if err != nil {
		tb.Fatalf("CreateExchangeRate SDK call failed: %v", err)
	}
	return f
}

func parseAccountType(accountType string) financev1.Account_Type {
	switch accountType {
	case "BANK":
		return financev1.Account_BANK
	case "CASH":
		return financev1.Account_CASH
	case "CREDIT_CARD":
		return financev1.Account_CREDIT_CARD
	default:
		return financev1.Account_DIGITAL_ACCOUNT
	}
}

func parseBorrowingDirection(direction string) financev1.Borrowing_Direction {
	switch direction {
	case "LENT":
		return financev1.Borrowing_LENT
	case "BORROWED":
		return financev1.Borrowing_BORROWED
	default:
		return financev1.Borrowing_DIRECTION_UNSPECIFIED
	}
}
