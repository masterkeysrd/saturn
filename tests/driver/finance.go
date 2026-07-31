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
	Assert      func(tb testing.TB, txn *financev1.Transaction)
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

// Client returns the underlying strongly typed financev1.Client SDK instance.
func (f *FinanceDriver) Client() *financev1.Client {
	return f.getClient()
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

// AccountOptions parameters for creating a financial account.
type AccountOptions struct {
	Name           string
	Type           financev1.Account_Type
	Currency       string
	InitialBalance int64
	ExpectErr      string
	Assert         func(tb testing.TB, acc *financev1.Account)
}

// CreateAccount creates a financial account using AccountOptions struct.
func (f *FinanceDriver) CreateAccount(tb testing.TB, opts AccountOptions) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	acc, err := client.CreateAccount(tb.Context(), &financev1.CreateAccountRequest{
		Account: &financev1.Account{
			Name:           opts.Name,
			Type:           opts.Type,
			Currency:       opts.Currency,
			InitialBalance: opts.InitialBalance,
		},
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("CreateAccount succeeded, but expected error containing %q", opts.ExpectErr)
			return f
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateAccount error = %v, want error containing %q", err, opts.ExpectErr)
			return f
		}
		return f
	}

	if err != nil {
		tb.Fatalf("CreateAccount SDK call failed: %v", err)
		return f
	}

	if acc.GetName() != opts.Name {
		tb.Errorf("CreateAccount Name = %q, want %q", acc.GetName(), opts.Name)
	}
	if opts.Currency != "" && acc.GetCurrency() != opts.Currency {
		tb.Errorf("CreateAccount Currency = %s, want %s", acc.GetCurrency(), opts.Currency)
	}
	if acc.GetInitialBalance() != opts.InitialBalance {
		tb.Errorf("CreateAccount InitialBalance = %d, want %d", acc.GetInitialBalance(), opts.InitialBalance)
	}

	accInfo := &AccountInfo{
		ID:             acc.GetId(),
		Name:           opts.Name,
		Type:           opts.Type,
		Currency:       opts.Currency,
		InitialBalance: opts.InitialBalance,
	}
	f.driver.state.Accounts[opts.Name] = accInfo
	f.driver.state.LastAccount = accInfo

	if opts.Assert != nil {
		opts.Assert(tb, acc)
	}
	return f
}

// BorrowingOptions parameters for creating a borrowing agreement.
type BorrowingOptions struct {
	Name         string
	Counterparty string
	Direction    financev1.Borrowing_Direction
	Currency     string
	TotalAmount  int64
	ExpectErr    string
	Assert       func(tb testing.TB, bor *financev1.Borrowing)
}

// CreateBorrowing creates a borrowing agreement using BorrowingOptions struct.
func (f *FinanceDriver) CreateBorrowing(tb testing.TB, opts BorrowingOptions) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	bor, err := client.CreateBorrowing(tb.Context(), &financev1.CreateBorrowingRequest{
		Borrowing: &financev1.Borrowing{
			Counterparty: opts.Counterparty,
			Direction:    opts.Direction,
			Currency:     opts.Currency,
			TotalAmount:  opts.TotalAmount,
		},
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("CreateBorrowing succeeded, but expected error containing %q", opts.ExpectErr)
			return f
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateBorrowing error = %v, want error containing %q", err, opts.ExpectErr)
			return f
		}
		return f
	}
	if err != nil {
		tb.Fatalf("CreateBorrowing SDK call failed: %v", err)
		return f
	}

	borInfo := &BorrowingInfo{
		ID:           bor.GetId(),
		Counterparty: opts.Counterparty,
		Direction:    opts.Direction,
		Currency:     opts.Currency,
		TotalAmount:  opts.TotalAmount,
	}
	borrowingName := opts.Name
	if borrowingName == "" {
		borrowingName = opts.Counterparty
	}
	f.driver.state.Borrowings[borrowingName] = borInfo
	f.driver.state.LastBorrowing = borInfo
	if opts.Assert != nil {
		opts.Assert(tb, bor)
	}
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

// TransferOptions parameters for executing an account transfer.
type TransferOptions struct {
	Key               string // Optional: key to register transfer in driver state
	FromAccount       string
	ToAccount         string
	SourceAmount      int64
	DestinationAmount int64 // Optional: defaults to SourceAmount if 0
	Notes             string
	ExpectErr         string
}

// CreateTransfer executes an internal account transfer using TransferOptions struct.
func (f *FinanceDriver) CreateTransfer(tb testing.TB, opts TransferOptions) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	srcAcc, ok := f.driver.state.Accounts[opts.FromAccount]
	if !ok {
		tb.Fatalf("account named %q not found in state registry", opts.FromAccount)
		return f
	}
	dstAcc, ok := f.driver.state.Accounts[opts.ToAccount]
	if !ok {
		tb.Fatalf("account named %q not found in state registry", opts.ToAccount)
		return f
	}

	destAmount := opts.DestinationAmount
	if destAmount == 0 {
		destAmount = opts.SourceAmount
	}

	client := f.getClient()
	transfer, err := client.CreateTransfer(tb.Context(), &financev1.CreateTransferRequest{
		SourceAccountId:      srcAcc.ID,
		DestinationAccountId: dstAcc.ID,
		SourceAmount:         opts.SourceAmount,
		DestinationAmount:    destAmount,
		Notes:                opts.Notes,
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("CreateTransfer succeeded, but expected error containing %q", opts.ExpectErr)
			return f
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateTransfer error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return f
	}
	if err != nil {
		tb.Fatalf("CreateTransfer SDK call failed: %v", err)
		return f
	}

	if transfer != nil {
		if opts.Key != "" {
			f.driver.state.Transfers[opts.Key] = transfer
		}
		f.driver.state.LastTransfer = transfer
	}
	return f
}

// AssertTransfer fluently fetches a Transfer and its two transaction legs (outflow & inflow) using transfer_id, passing them to a callback.
func (f *FinanceDriver) AssertTransfer(tb testing.TB, transferKey string, fn func(transfer *financev1.Transfer, outflowLeg, inflowLeg *financev1.Transaction)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	var transfer *financev1.Transfer
	if transferKey != "" {
		var ok bool
		transfer, ok = f.driver.state.Transfers[transferKey]
		if !ok {
			tb.Fatalf("AssertTransfer: transfer key %q not found in state registry", transferKey)
			return f
		}
	} else {
		transfer = f.driver.state.LastTransfer
		if transfer == nil {
			tb.Fatalf("AssertTransfer called, but no transfer has been created yet")
			return f
		}
	}

	client := f.getClient()
	ctx := tb.Context()

	// 1. Query Transaction legs using transfer_id filter
	txResp, err := client.ListTransactions(ctx, &financev1.ListTransactionsRequest{
		TransferId: &transfer.Id,
	})
	if err != nil {
		tb.Fatalf("AssertTransfer: ListTransactions SDK call failed for transfer_id %s: %v", transfer.Id, err)
		return f
	}

	var outflowLeg, inflowLeg *financev1.Transaction
	for _, tx := range txResp.Transactions {
		if tx.Type == financev1.Transaction_TRANSFER_OUT {
			outflowLeg = tx
		} else if tx.Type == financev1.Transaction_TRANSFER_IN {
			inflowLeg = tx
		}
	}

	if outflowLeg == nil {
		tb.Fatalf("AssertTransfer: missing TRANSFER_OUT leg for transfer %s", transfer.Id)
		return f
	}
	if inflowLeg == nil {
		tb.Fatalf("AssertTransfer: missing TRANSFER_IN leg for transfer %s", transfer.Id)
		return f
	}

	fn(transfer, outflowLeg, inflowLeg)
	return f
}

// BudgetOptions parameters for creating a budget definition.
type BudgetOptions struct {
	Name        string
	LimitAmount int64
	Currency    string
	Interval    financev1.Budget_RecurrenceInterval
	ExpectErr   string
	Assert      func(tb testing.TB, b *financev1.Budget)
}

// CreateBudget creates a budget category definition using BudgetOptions struct.
func (f *FinanceDriver) CreateBudget(tb testing.TB, opts BudgetOptions) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	interval := opts.Interval
	if interval == financev1.Budget_RECURRENCE_INTERVAL_UNSPECIFIED {
		interval = financev1.Budget_MONTHLY
	}

	client := f.getClient()
	bud, err := client.CreateBudget(tb.Context(), &financev1.CreateBudgetRequest{
		Budget: &financev1.Budget{
			Name:        opts.Name,
			LimitAmount: opts.LimitAmount,
			Currency:    opts.Currency,
			Interval:    interval,
			IsActive:    true,
		},
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("CreateBudget succeeded, but expected error containing %q", opts.ExpectErr)
			return f
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateBudget error = %v, want error containing %q", err, opts.ExpectErr)
			return f
		}
		return f
	}

	if err != nil {
		tb.Fatalf("CreateBudget SDK call failed: %v", err)
		return f
	}

	if bud.GetName() != opts.Name {
		tb.Errorf("CreateBudget Name = %q, want %q", bud.GetName(), opts.Name)
	}
	if bud.GetLimitAmount() != opts.LimitAmount {
		tb.Errorf("CreateBudget LimitAmount = %d, want %d", bud.GetLimitAmount(), opts.LimitAmount)
	}
	if opts.Currency != "" && bud.GetCurrency() != opts.Currency {
		tb.Errorf("CreateBudget Currency = %s, want %s", bud.GetCurrency(), opts.Currency)
	}

	f.driver.state.Budgets[opts.Name] = bud.GetId()
	if opts.Assert != nil {
		opts.Assert(tb, bud)
	}
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
	txn, err := client.CreateExpense(tb.Context(), &financev1.CreateExpenseRequest{
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
		return f
	}

	if txn.GetAmount() != opts.Amount {
		tb.Errorf("CreateExpense Amount = %d, want %d", txn.GetAmount(), opts.Amount)
	}
	if currency != "" && txn.GetCurrency() != currency {
		tb.Errorf("CreateExpense Currency = %s, want %s", txn.GetCurrency(), currency)
	}
	if opts.Description != "" && txn.GetDescription() != opts.Description {
		tb.Errorf("CreateExpense Description = %q, want %q", txn.GetDescription(), opts.Description)
	}
	if txn.GetBudgetId() != budID {
		tb.Errorf("CreateExpense BudgetId = %s, want %s", txn.GetBudgetId(), budID)
	}

	f.driver.state.LastTransaction = txn
	if opts.Assert != nil {
		opts.Assert(tb, txn)
	}
	return f
}

// AssertLastTransaction executes an assertion callback against the transaction fetched live from the API using GetTransaction.
func (f *FinanceDriver) AssertLastTransaction(tb testing.TB, fn func(txn *financev1.Transaction)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	if f.driver.state.LastTransaction == nil {
		tb.Fatalf("AssertLastTransaction called, but no transaction has been created yet")
		return f
	}

	targetID := f.driver.state.LastTransaction.GetId()
	client := f.getClient()
	txn, err := client.GetTransaction(tb.Context(), &financev1.GetTransactionRequest{
		Id: targetID,
	})
	if err != nil {
		tb.Fatalf("AssertLastTransaction: GetTransaction API call failed for ID %s: %v", targetID, err)
		return f
	}

	fn(txn)
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
	resp, err := client.CreateRecurringExpense(tb.Context(), &financev1.CreateRecurringExpenseRequest{
		RecurringExpense: &financev1.RecurringExpense{
			Name:     expenseName,
			BudgetId: budID,
			Amount:   amount,
			Currency: currency,
			Interval: financev1.RecurringExpense_MONTHLY,
			Status:   financev1.RecurringExpense_ACTIVE,
			ExecutionState: &financev1.RecurringExpense_ExecutionState{
				NextDueDate: timestamppb.Now(),
			},
		},
	})
	if err != nil {
		tb.Fatalf("CreateRecurringExpense SDK call failed: %v", err)
		return f
	}

	f.driver.state.LastRecurringExpenseID = resp.GetId()
	return f
}

// AssertPendingScheduledPaymentsCount asserts the number of remaining pending scheduled payments.
func (f *FinanceDriver) AssertPendingScheduledPaymentsCount(tb testing.TB, expectedCount int) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	client := f.getClient()
	listResp, err := client.ListScheduledPayments(tb.Context(), &financev1.ListScheduledPaymentsRequest{})
	if err != nil {
		tb.Fatalf("AssertPendingScheduledPaymentsCount SDK call failed: %v", err)
		return f
	}

	actualCount := len(listResp.GetScheduledPayments())
	if actualCount != expectedCount {
		tb.Errorf("Pending Scheduled Payments count = %d, want %d", actualCount, expectedCount)
	}

	return f
}

// ConfirmScheduledPaymentOptions parameters for confirming scheduled payments.
type ConfirmScheduledPaymentOptions struct {
	PaymentID string
	Account   string
	Currency  string
	Amount    int64
	ExpectErr string
}

// ConfirmScheduledPayment confirms a scheduled payment using ConfirmScheduledPaymentOptions struct.
func (f *FinanceDriver) ConfirmScheduledPayment(tb testing.TB, opts ConfirmScheduledPaymentOptions) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	acc, ok := f.driver.state.Accounts[opts.Account]
	if !ok {
		tb.Fatalf("account named %q not found in state registry", opts.Account)
		return f
	}

	client := f.getClient()
	targetPaymentID := opts.PaymentID
	if targetPaymentID == "" {
		listResp, err := client.ListScheduledPayments(tb.Context(), &financev1.ListScheduledPaymentsRequest{})
		if err != nil {
			tb.Fatalf("ListScheduledPayments SDK call failed: %v", err)
			return f
		}

		if len(listResp.GetScheduledPayments()) == 0 {
			tb.Fatalf("ConfirmScheduledPayment called, but no pending scheduled payments found")
			return f
		}

		targetPaymentID = listResp.GetScheduledPayments()[0].GetId()
	}

	accID := acc.ID
	req := &financev1.ConfirmScheduledPaymentRequest{
		PaymentId: targetPaymentID,
		AccountId: &accID,
	}

	if opts.Currency != "" {
		c := opts.Currency
		req.Currency = &c
	}
	if opts.Amount > 0 {
		req.ActualAmount = opts.Amount
	}

	txn, err := client.ConfirmScheduledPayment(tb.Context(), req)

	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("ConfirmScheduledPayment succeeded, but expected error containing %q", opts.ExpectErr)
			return f
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("ConfirmScheduledPayment error = %v, want error containing %q", err, opts.ExpectErr)
			return f
		}
		return f
	}

	if err != nil {
		tb.Fatalf("ConfirmScheduledPayment SDK call failed: %v", err)
		return f
	}

	f.driver.state.LastTransaction = txn
	f.driver.state.LastConfirmedScheduledPaymentID = targetPaymentID
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

// AssertSpentInsights verifies analytics insights aggregation statistics for the active space.
func (f *FinanceDriver) AssertSpentInsights(tb testing.TB, expectedTotalSpent int64) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	client := f.getClient()
	now := time.Now()
	start := timestamppb.New(now.AddDate(-1, 0, 0))
	end := timestamppb.New(now.AddDate(1, 0, 0))

	resp, err := client.GetInsights(tb.Context(), &financev1.GetInsightsRequest{
		Granularity: financev1.InsightGranularity_MONTHLY,
		StartDate:   start,
		EndDate:     end,
	})
	if err != nil {
		tb.Fatalf("GetInsights SDK call failed: %v", err)
		return f
	}

	spent := resp.GetSpent()
	if spent == nil {
		tb.Fatalf("GetInsights returned nil spent statistics")
		return f
	}

	if spent.GetTotalSpent() != expectedTotalSpent {
		tb.Errorf("GetInsights TotalSpent = %d, want %d (Distributions: %+v, Trend: %+v)", spent.GetTotalSpent(), expectedTotalSpent, spent.GetDistributions(), spent.GetTrend())
	}
	return f
}

// AssertScheduledPayment executes a live API query to GET /v1/finance/scheduled-payments/{id} and runs an assertion callback.
func (f *FinanceDriver) AssertScheduledPayment(tb testing.TB, paymentID string, fn func(sp *financev1.ScheduledPayment)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	client := f.getClient()
	sp, err := client.GetScheduledPayment(tb.Context(), &financev1.GetScheduledPaymentRequest{
		Id: paymentID,
	})
	if err != nil {
		tb.Fatalf("AssertScheduledPayment: GetScheduledPayment API call failed for ID %s: %v", paymentID, err)
		return f
	}

	fn(sp)
	return f
}

// GetLastRecurringExpense fetches details of the last created recurring expense via live API.
func (f *FinanceDriver) GetLastRecurringExpense(tb testing.TB) *financev1.RecurringExpense {
	tb.Helper()
	if f.driver.state.LastRecurringExpenseID == "" {
		tb.Fatalf("GetLastRecurringExpense: no recurring expense created in driver state")
		return nil
	}
	client := f.getClient()
	resp, err := client.ListRecurringExpenses(tb.Context(), &financev1.ListRecurringExpensesRequest{})
	if err != nil {
		tb.Fatalf("GetLastRecurringExpense: ListRecurringExpenses API call failed: %v", err)
		return nil
	}
	for _, re := range resp.GetRecurringExpenses() {
		if re.GetId() == f.driver.state.LastRecurringExpenseID {
			return re
		}
	}
	tb.Fatalf("GetLastRecurringExpense: recurring expense %s not found", f.driver.state.LastRecurringExpenseID)
	return nil
}

// AssertLastRecurringExpense fluently queries the live API for the last created recurring expense and runs an assertion callback.
func (f *FinanceDriver) AssertLastRecurringExpense(tb testing.TB, fn func(re *financev1.RecurringExpense)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	re := f.GetLastRecurringExpense(tb)
	if re != nil {
		fn(re)
	}
	return f
}

// GetPendingScheduledPayment queries the live API and returns the first pending scheduled payment proto object.
func (f *FinanceDriver) GetPendingScheduledPayment(tb testing.TB) *financev1.ScheduledPayment {
	tb.Helper()
	client := f.getClient()
	listResp, err := client.ListScheduledPayments(tb.Context(), &financev1.ListScheduledPaymentsRequest{})
	if err != nil {
		tb.Fatalf("GetPendingScheduledPayment: ListScheduledPayments API call failed: %v", err)
		return nil
	}
	if len(listResp.GetScheduledPayments()) == 0 {
		tb.Fatalf("GetPendingScheduledPayment: expected pending scheduled payment, got none")
		return nil
	}
	return listResp.GetScheduledPayments()[0]
}

// AssertPendingScheduledPayment fluently queries the live API for the first pending scheduled payment and runs an assertion callback.
func (f *FinanceDriver) AssertPendingScheduledPayment(tb testing.TB, fn func(sp *financev1.ScheduledPayment)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	sp := f.GetPendingScheduledPayment(tb)
	if sp != nil {
		fn(sp)
	}
	return f
}
