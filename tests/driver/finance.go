package driver

import (
	"fmt"
	"strings"
	"testing"
	"time"

	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/masterkeysrd/saturn/apis/saturn"
	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/platform/id"
)

// ExpenseOptions encapsulates parameters for logging an expense transaction.
type ExpenseOptions struct {
	Account         string
	Budget          string
	Currency        string
	Amount          int64
	Description     string
	TransactionDate time.Time
	ExpectErr       string
	Assert          func(tb testing.TB, txn *financev1.Transaction)
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

func (f *FinanceDriver) GetClient() *financev1.Client {
	return f.getClient()
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
	LastFour       string
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
			LastFour:       opts.LastFour,
		},
	})
	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("CreateAccount succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateAccount error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return f
	}

	if err != nil {
		tb.Fatalf("CreateAccount SDK call failed: %v", err)
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
		LastFour:       opts.LastFour,
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
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateBorrowing error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return f
	}
	if err != nil {
		tb.Fatalf("CreateBorrowing SDK call failed: %v", err)
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
	}
	acc, ok := f.driver.state.Accounts[opts.Account]
	if !ok {
		tb.Fatalf("account named %q not found in state registry", opts.Account)
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
	}

	client := f.getClient()
	_, err := client.DeleteTransaction(tb.Context(), &financev1.DeleteTransactionRequest{
		Id: rep.ID,
	})
	if err != nil {
		tb.Fatalf("DeleteTransaction SDK call failed for repayment: %v", err)
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
	}

	client := f.getClient()
	resp, err := client.ListAccounts(tb.Context(), &financev1.ListAccountsRequest{})
	if err != nil {
		tb.Fatalf("ListAccounts SDK call failed: %v", err)
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
	}

	if foundAcc.GetCurrentBalance() != expectedBalance {
		tb.Errorf("Account %q balance = %d, want %d", accountName, foundAcc.GetCurrentBalance(), expectedBalance)
	}
	return f
}

// AssertAccount fetches a named account live from the API and executes an assertion callback against it.
func (f *FinanceDriver) AssertAccount(tb testing.TB, accountName string, fn func(acc *financev1.Account)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	accInfo, ok := f.driver.state.Accounts[accountName]
	if !ok {
		tb.Fatalf("AssertAccount: account named %q not found in state registry", accountName)
	}
	client := f.getClient()
	resp, err := client.GetAccount(tb.Context(), &financev1.GetAccountRequest{
		Id: accInfo.ID,
	})
	if err != nil {
		tb.Fatalf("AssertAccount: GetAccount API call failed for %q (ID %s): %v", accountName, accInfo.ID, err)
	}
	fn(resp)
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
	}

	client := f.getClient()
	resp, err := client.ListBorrowings(tb.Context(), &financev1.ListBorrowingsRequest{})
	if err != nil {
		tb.Fatalf("ListBorrowings SDK call failed: %v", err)
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
	}

	client := f.getClient()
	resp, err := client.ListTransactions(tb.Context(), &financev1.ListTransactionsRequest{})
	if err != nil {
		tb.Fatalf("ListTransactions SDK call failed: %v", err)
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
	}
	dstAcc, ok := f.driver.state.Accounts[opts.ToAccount]
	if !ok {
		tb.Fatalf("account named %q not found in state registry", opts.ToAccount)
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
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateTransfer error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return f
	}
	if err != nil {
		tb.Fatalf("CreateTransfer SDK call failed: %v", err)
	}

	if transfer != nil {
		if opts.Key != "" {
			f.driver.state.Transfers[opts.Key] = transfer
		}
		f.driver.state.LastTransfer = transfer
		trfID := transfer.GetId()
		txns, listErr := client.ListTransactions(tb.Context(), &financev1.ListTransactionsRequest{
			TransferId: &trfID,
		})
		if listErr == nil {
			for _, txn := range txns.GetTransactions() {
				if txn.GetType() == financev1.Transaction_TRANSFER_OUT {
					f.driver.state.LastTransactionID = txn.GetId()
					break
				}
			}
		}
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
		}
	} else {
		transfer = f.driver.state.LastTransfer
		if transfer == nil {
			tb.Fatalf("AssertTransfer called, but no transfer has been created yet")
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
	}

	var outflowLeg, inflowLeg *financev1.Transaction
	for _, tx := range txResp.Transactions {
		switch tx.Type {
		case financev1.Transaction_TRANSFER_OUT:
			outflowLeg = tx
		case financev1.Transaction_TRANSFER_IN:
			inflowLeg = tx
		}
	}

	if outflowLeg == nil {
		tb.Fatalf("AssertTransfer: missing TRANSFER_OUT leg for transfer %s", transfer.Id)
	}
	if inflowLeg == nil {
		tb.Fatalf("AssertTransfer: missing TRANSFER_IN leg for transfer %s", transfer.Id)
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
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateBudget error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return f
	}

	if err != nil {
		tb.Fatalf("CreateBudget SDK call failed: %v", err)
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
	}
	budID, ok := f.driver.state.Budgets[opts.Budget]
	if !ok {
		tb.Fatalf("budget named %q not found in state registry", opts.Budget)
	}

	currency := opts.Currency
	if currency == "" {
		currency = acc.Currency
	}

	var txnDate *timestamppb.Timestamp
	if !opts.TransactionDate.IsZero() {
		txnDate = timestamppb.New(opts.TransactionDate)
	}

	client := f.getClient()
	txn, err := client.CreateExpense(tb.Context(), &financev1.CreateExpenseRequest{
		Expense: &financev1.ExpenseInput{
			BudgetId:        budID,
			Amount:          opts.Amount,
			Currency:        currency,
			Description:     opts.Description,
			AccountId:       &acc.ID,
			TransactionDate: txnDate,
		},
	})

	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("CreateExpense succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("CreateExpense error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return f
	}

	if err != nil {
		tb.Fatalf("CreateExpense SDK call failed: %v", err)
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

	f.driver.state.LastTransactionID = txn.GetId()
	if opts.Assert != nil {
		opts.Assert(tb, txn)
	}
	return f
}

// AssertTransaction executes an assertion callback against a transaction fetched live by ID from the API.
func (f *FinanceDriver) AssertTransaction(tb testing.TB, txnID string, fn func(txn *financev1.Transaction)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	txn, err := client.GetTransaction(tb.Context(), &financev1.GetTransactionRequest{
		Id: txnID,
	})
	if err != nil {
		tb.Fatalf("AssertTransaction: GetTransaction API call failed for ID %s: %v", txnID, err)
	}
	fn(txn)
	return f
}

// AssertLastTransaction executes an assertion callback against the transaction fetched live from the API using GetTransaction.
func (f *FinanceDriver) AssertLastTransaction(tb testing.TB, fn func(txn *financev1.Transaction)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	if f.driver.state.LastTransactionID == "" {
		tb.Fatalf("AssertLastTransaction called, but no LastTransactionID recorded in driver state")
	}

	client := f.getClient()
	targetID := f.driver.state.LastTransactionID
	txn, err := client.GetTransaction(tb.Context(), &financev1.GetTransactionRequest{
		Id: targetID,
	})
	if err != nil {
		tb.Fatalf("AssertLastTransaction: GetTransaction API call failed for ID %s: %v", targetID, err)
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
	}

	client := f.getClient()
	viewFull := financev1.Budget_FULL
	resp, err := client.ListBudgets(tb.Context(), &financev1.ListBudgetsRequest{
		View: &viewFull,
	})
	if err != nil {
		tb.Fatalf("ListBudgets SDK call failed: %v", err)
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
	}

	curPeriod := targetBud.GetCurrentPeriod()
	if curPeriod == nil {
		tb.Fatalf("budget %q has no active period info", budgetName)
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
	}

	client := f.getClient()
	_, err := client.DeleteBudget(tb.Context(), &financev1.DeleteBudgetRequest{
		Id: budID,
	})

	if opts.ExpectErr != "" {
		if err == nil {
			tb.Fatalf("DeleteBudget succeeded, but expected error containing %q", opts.ExpectErr)
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("DeleteBudget error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return f
	}

	if err != nil {
		tb.Fatalf("DeleteBudget SDK call failed: %v", err)
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
	}

	f.driver.state.LastRecurringExpenseID = resp.GetId()

	listResp, err := client.ListScheduledPayments(tb.Context(), &financev1.ListScheduledPaymentsRequest{
		Status: financev1.ScheduledPayment_PENDING,
	})
	if err == nil {
		for _, sp := range listResp.GetScheduledPayments() {
			if sp.GetSourceId() == resp.GetId() {
				f.driver.state.ScheduledPayments[expenseName] = sp.GetId()
				f.driver.state.LastScheduledPaymentID = sp.GetId()
				break
			}
		}
	}
	return f
}

// AssertPendingScheduledPaymentsCount asserts the number of remaining pending scheduled payments.
func (f *FinanceDriver) AssertPendingScheduledPaymentsCount(tb testing.TB, expectedCount int) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	client := f.getClient()
	pendingStatus := financev1.ScheduledPayment_PENDING
	listResp, err := client.ListScheduledPayments(tb.Context(), &financev1.ListScheduledPaymentsRequest{
		Status: pendingStatus,
	})
	if err != nil {
		tb.Fatalf("AssertPendingScheduledPaymentsCount SDK call failed: %v", err)
	}

	actualCount := len(listResp.GetScheduledPayments())
	if actualCount != expectedCount {
		tb.Errorf("Pending Scheduled Payments count = %d, want %d", actualCount, expectedCount)
	}

	return f
}

// ConfirmScheduledPaymentOptions parameters for confirming scheduled payments.
type ConfirmScheduledPaymentOptions struct {
	PaymentID              string
	ScheduledPaymentName   string
	ScheduledPaymentAmount int64
	Account                string
	Currency               string
	Amount                 int64
	ExpectErr              string
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
	}

	client := f.getClient()
	targetPaymentID := opts.PaymentID
	if targetPaymentID == "" {
		if opts.ScheduledPaymentName != "" {
			if id, ok := f.driver.state.ScheduledPayments[opts.ScheduledPaymentName]; ok {
				targetPaymentID = id
			}
		}
		if targetPaymentID == "" {
			targetPaymentID = f.driver.state.LastScheduledPaymentID
		}
	}
	if targetPaymentID == "" {
		tb.Fatalf("ConfirmScheduledPayment requires explicit PaymentID or active state scheduled payment")
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
		}
		if !strings.Contains(err.Error(), opts.ExpectErr) {
			tb.Fatalf("ConfirmScheduledPayment error = %v, want error containing %q", err, opts.ExpectErr)
		}
		return f
	}

	if err != nil {
		tb.Fatalf("ConfirmScheduledPayment SDK call failed: %v", err)
	}

	f.driver.state.LastTransactionID = txn.GetId()
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
	}

	spent := resp.GetSpent()
	if spent == nil {
		tb.Fatalf("GetInsights returned nil spent statistics")
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
	}

	fn(sp)
	return f
}

// AssertLastRecurringExpense fluently queries the live API for the last created recurring expense and runs an assertion callback.
func (f *FinanceDriver) AssertLastRecurringExpense(tb testing.TB, fn func(re *financev1.RecurringExpense)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	if f.driver.state.LastRecurringExpenseID == "" {
		tb.Fatalf("AssertLastRecurringExpense: no recurring expense created in driver state")
	}
	client := f.getClient()
	resp, err := client.ListRecurringExpenses(tb.Context(), &financev1.ListRecurringExpensesRequest{})
	if err != nil {
		tb.Fatalf("AssertLastRecurringExpense: ListRecurringExpenses API call failed: %v", err)
	}
	var matched *financev1.RecurringExpense
	for _, re := range resp.GetRecurringExpenses() {
		if re.GetId() == f.driver.state.LastRecurringExpenseID {
			matched = re
			break
		}
	}
	if matched == nil {
		tb.Fatalf("AssertLastRecurringExpense: recurring expense %s not found", f.driver.state.LastRecurringExpenseID)
	}
	fn(matched)
	return f
}

// AssertScheduledPaymentByAmount queries the live API for a scheduled payment matching the amount and executes an assertion callback.
func (f *FinanceDriver) AssertScheduledPaymentByAmount(tb testing.TB, amount int64, fn func(sp *financev1.ScheduledPayment)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	listResp, err := client.ListScheduledPayments(tb.Context(), &financev1.ListScheduledPaymentsRequest{})
	if err != nil {
		tb.Fatalf("AssertScheduledPaymentByAmount: ListScheduledPayments API call failed: %v", err)
	}
	var matched *financev1.ScheduledPayment
	for _, sp := range listResp.GetScheduledPayments() {
		if sp.GetAmount() == amount {
			matched = sp
			break
		}
	}
	if matched == nil {
		tb.Fatalf("AssertScheduledPaymentByAmount: no scheduled payment found matching amount %d", amount)
	}
	fn(matched)
	return f
}

// AssertPendingScheduledPayment fluently queries the live API for the first pending scheduled payment and runs an assertion callback.
func (f *FinanceDriver) AssertPendingScheduledPayment(tb testing.TB, fn func(sp *financev1.ScheduledPayment)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}
	client := f.getClient()
	listResp, err := client.ListScheduledPayments(tb.Context(), &financev1.ListScheduledPaymentsRequest{})
	if err != nil {
		tb.Fatalf("AssertPendingScheduledPayment API call failed: %v", err)
	}
	if len(listResp.GetScheduledPayments()) == 0 {
		tb.Fatalf("AssertPendingScheduledPayment: no scheduled payments found")
	}
	fn(listResp.GetScheduledPayments()[0])
	return f
}

// StageInboxItemOptions parameters for staging a raw inbox item into the DB staging table.
type StageInboxItemOptions struct {
	Key                        string
	DocType                    financev1.InboxItem_DocType
	Amount                     int64
	Currency                   string
	Vendor                     string
	AccountName                string
	BudgetName                 string
	CardLastFour               string
	ScheduledPaymentID         string
	ScheduledPaymentName       string
	ScheduledPaymentAmount     int64
	TransactionID              string
	LinkToLastTransaction      bool
	BorrowingID                string
	BorrowingLinkType          financev1.BorrowingLinkType
	OverwriteLinkedTransaction bool
	TransactionType            string
	DestinationAccountName     string
	TransferLeg                string
}

// StageInboxItem inserts a raw staging inbox item into the space's inbox staging queue in PostgreSQL.
func (f *FinanceDriver) StageInboxItem(tb testing.TB, opts StageInboxItemOptions) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	spaceID := f.driver.state.SpaceID
	if spaceID == "" {
		tb.Fatalf("StageInboxItem called without active space context")
	}

	integrationID := f.driver.state.LastIntegrationID
	if integrationID == "" {
		tb.Fatalf("StageInboxItem called, but no platform integration channel has been ensured in driver state")
	}

	currency := opts.Currency
	if currency == "" {
		currency = "USD"
	}

	var accountID *string
	if opts.AccountName != "" {
		acc, ok := f.driver.state.Accounts[opts.AccountName]
		if !ok {
			tb.Fatalf("StageInboxItem: account named %q not found in state registry", opts.AccountName)
		}
		accountID = &acc.ID
	} else if opts.CardLastFour != "" {
		var selected *AccountInfo
		for _, acc := range f.driver.state.Accounts {
			if acc.LastFour == opts.CardLastFour {
				if selected == nil || acc.Currency == currency {
					selected = acc
					if acc.Currency == currency {
						break
					}
				}
			}
		}
		if selected != nil {
			accountID = &selected.ID
		}
	}

	var budgetID *string
	if opts.BudgetName != "" {
		bID, ok := f.driver.state.Budgets[opts.BudgetName]
		if !ok {
			tb.Fatalf("StageInboxItem: budget named %q not found in state registry", opts.BudgetName)
		}
		budgetID = &bID
	}

	docTypeStr := "unknown"
	switch opts.DocType {
	case financev1.InboxItem_INVOICE:
		docTypeStr = "invoice"
	case financev1.InboxItem_RECEIPT:
		docTypeStr = "receipt"
	case financev1.InboxItem_BANK_NOTIFICATION:
		docTypeStr = "bank_notification"
	case financev1.InboxItem_SYSTEM_VERIFICATION:
		docTypeStr = "system_verification"
	}

	inboxID, _ := id.Generate("ibx_")
	txDate := time.Now().UTC()

	_, err := f.driver.env.DB.Exec(`
		INSERT INTO finance.inbox_item 
		(id, space_id, integration_id, status, doc_type, amount, currency, vendor_name, transaction_date, account_id, budget_id, raw_payload, metadata, create_time)
		VALUES ($1, $2, $3, 'pending', $4, $5, $6, $7, $8, $9, $10, '', '{}', $11)
	`, inboxID, spaceID, integrationID, docTypeStr, opts.Amount, currency, opts.Vendor, txDate, accountID, budgetID, txDate)
	if err != nil {
		tb.Fatalf("StageInboxItem: failed to insert inbox item into database: %v", err)
	}

	info := &InboxItemInfo{
		ID:        inboxID,
		DocType:   opts.DocType,
		Amount:    opts.Amount,
		Vendor:    opts.Vendor,
		AccountID: unptr(accountID),
		BudgetID:  unptr(budgetID),
	}

	if opts.Key != "" {
		f.driver.state.InboxItems[opts.Key] = info
	}
	f.driver.state.LastInboxItem = info
	return f
}

// AssertInboxItemCount queries ListInboxItems API for a given status and asserts the expected count.
func (f *FinanceDriver) AssertInboxItemCount(tb testing.TB, status financev1.InboxItem_Status, expectedCount int) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	client := f.getClient()
	resp, err := client.ListInboxItems(tb.Context(), &financev1.ListInboxItemsRequest{
		Status: &status,
	})
	if err != nil {
		tb.Fatalf("AssertInboxItemCount: ListInboxItems API call failed: %v", err)
	}
	if len(resp.GetInboxItems()) != expectedCount {
		statuses := []string{}
		for _, item := range resp.GetInboxItems() {
			statuses = append(statuses, fmt.Sprintf("id=%s status=%s", item.GetId(), item.GetStatus()))
		}
		tb.Errorf("AssertInboxItemCount for status %s = %d, want %d (items: %s)", status, len(resp.GetInboxItems()), expectedCount, strings.Join(statuses, ", "))
	}
	return f
}

// AssertInboxItem fluently fetches an InboxItem from the API and runs an assertion callback.
func (f *FinanceDriver) AssertInboxItem(tb testing.TB, key string, fn func(item *financev1.InboxItem)) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	var info *InboxItemInfo
	if key != "" {
		var ok bool
		info, ok = f.driver.state.InboxItems[key]
		if !ok {
			tb.Fatalf("AssertInboxItem: key %q not found in state registry", key)
		}
	} else {
		info = f.driver.state.LastInboxItem
		if info == nil {
			tb.Fatalf("AssertInboxItem: no inbox item staged in driver state")
		}
	}

	client := f.getClient()
	resp, err := client.ListInboxItems(tb.Context(), &financev1.ListInboxItemsRequest{})
	if err != nil {
		tb.Fatalf("AssertInboxItem: ListInboxItems API call failed: %v", err)
	}

	var matched *financev1.InboxItem
	for _, item := range resp.GetInboxItems() {
		if item.GetId() == info.ID {
			matched = item
			break
		}
	}
	if matched == nil {
		tb.Fatalf("AssertInboxItem: item ID %s not found in ListInboxItems response", info.ID)
	}

	fn(matched)
	return f
}

// GetInboxItemID returns the ID of a staged inbox item by key.
func (f *FinanceDriver) GetInboxItemID(key string) string {
	if info, ok := f.driver.state.InboxItems[key]; ok {
		return info.ID
	}
	return ""
}

// UpdateInboxItem updates a staged inbox item's draft properties via API.
func (f *FinanceDriver) UpdateInboxItem(tb testing.TB, key string, opts StageInboxItemOptions) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	var info *InboxItemInfo
	if key != "" {
		var ok bool
		info, ok = f.driver.state.InboxItems[key]
		if !ok {
			tb.Fatalf("UpdateInboxItem: key %q not found in state registry", key)
		}
	} else {
		info = f.driver.state.LastInboxItem
		if info == nil {
			tb.Fatalf("UpdateInboxItem: no inbox item staged in driver state")
		}
	}

	var accountID *string
	if opts.AccountName != "" {
		acc, ok := f.driver.state.Accounts[opts.AccountName]
		if !ok {
			tb.Fatalf("UpdateInboxItem: account named %q not found in state registry", opts.AccountName)
		}
		accountID = &acc.ID
	}

	var budgetID *string
	if opts.BudgetName != "" {
		bID, ok := f.driver.state.Budgets[opts.BudgetName]
		if !ok {
			tb.Fatalf("UpdateInboxItem: budget named %q not found in state registry", opts.BudgetName)
		}
		budgetID = &bID
	}

	client := f.getClient()

	spID := opts.ScheduledPaymentID
	if spID == "" {
		if opts.ScheduledPaymentName != "" {
			if id, ok := f.driver.state.ScheduledPayments[opts.ScheduledPaymentName]; ok {
				spID = id
			}
		}
		if spID == "" && opts.ScheduledPaymentAmount > 0 {
			spID = f.driver.state.LastScheduledPaymentID
		}
	}

	txnID := opts.TransactionID
	if txnID == "" && opts.LinkToLastTransaction {
		txnID = f.driver.state.LastTransactionID
	}

	item := &financev1.InboxItem{
		Id:                 info.ID,
		AccountId:          unptr(accountID),
		BudgetId:           unptr(budgetID),
		ScheduledPaymentId: spID,
		TransactionId:      txnID,
	}

	bID := opts.BorrowingID
	if bID != "" {
		if borInfo, ok := f.driver.state.Borrowings[bID]; ok {
			bID = borInfo.ID
		}
		item.BorrowingId = &bID
		lt := opts.BorrowingLinkType
		if lt == financev1.BorrowingLinkType_BORROWING_LINK_TYPE_UNSPECIFIED {
			lt = financev1.BorrowingLinkType_BORROWING_LINK_TYPE_REPAYMENT
		}
		item.BorrowingLinkType = &lt
	}

	if item.Metadata == nil {
		item.Metadata = make(map[string]string)
	}
	if opts.OverwriteLinkedTransaction {
		item.Metadata["overwrite_linked_transaction"] = "true"
	}
	if opts.TransactionType != "" {
		item.Metadata["transaction_type"] = opts.TransactionType
	}
	if opts.DestinationAccountName != "" {
		if destAcc, ok := f.driver.state.Accounts[opts.DestinationAccountName]; ok {
			item.Metadata["destination_account_id"] = destAcc.ID
		} else {
			item.Metadata["destination_account_id"] = opts.DestinationAccountName
		}
	}
	if opts.TransferLeg != "" {
		item.Metadata["transfer_leg"] = opts.TransferLeg
	}

	amt := opts.Amount
	if amt == 0 {
		amt = info.Amount
	}
	item.Amount = amt

	vendor := opts.Vendor
	if vendor == "" {
		vendor = info.Vendor
	}
	item.VendorName = vendor

	_, err := client.UpdateInboxItem(tb.Context(), &financev1.UpdateInboxItemRequest{
		Id:        info.ID,
		InboxItem: item,
	})
	if err != nil {
		tb.Fatalf("UpdateInboxItem API call failed: %v", err)
	}
	return f
}

// ApproveInboxItem approves a staged inbox item via API.
func (f *FinanceDriver) ApproveInboxItem(tb testing.TB, key string, expectErr ...string) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	var info *InboxItemInfo
	if key != "" {
		var ok bool
		info, ok = f.driver.state.InboxItems[key]
		if !ok {
			tb.Fatalf("ApproveInboxItem: key %q not found in state registry", key)
		}
	} else {
		info = f.driver.state.LastInboxItem
		if info == nil {
			tb.Fatalf("ApproveInboxItem: no inbox item staged in driver state")
		}
	}

	client := f.getClient()
	item, err := client.ApproveInboxItem(tb.Context(), &financev1.ApproveInboxItemRequest{
		Id: info.ID,
	})
	if len(expectErr) > 0 && expectErr[0] != "" {
		if err == nil {
			tb.Fatalf("ApproveInboxItem succeeded, but expected error containing %q", expectErr[0])
		}
		if !strings.Contains(err.Error(), expectErr[0]) {
			tb.Fatalf("ApproveInboxItem error = %v, want error containing %q", err, expectErr[0])
		}
		return f
	}
	if err != nil {
		tb.Fatalf("ApproveInboxItem API call failed for ID %s: %v", info.ID, err)
	}

	if item != nil && item.GetTransactionId() != "" {
		f.driver.state.LastTransactionID = item.GetTransactionId()
	}
	return f
}

// DiscardInboxItem discards a staged inbox item via API.
func (f *FinanceDriver) DiscardInboxItem(tb testing.TB, key string) *FinanceDriver {
	tb.Helper()
	if tb.Failed() {
		return f
	}

	var info *InboxItemInfo
	if key != "" {
		var ok bool
		info, ok = f.driver.state.InboxItems[key]
		if !ok {
			tb.Fatalf("DiscardInboxItem: key %q not found in state registry", key)
		}
	} else {
		info = f.driver.state.LastInboxItem
		if info == nil {
			tb.Fatalf("DiscardInboxItem: no inbox item staged in driver state")
		}
	}

	client := f.getClient()
	_, err := client.DiscardInboxItem(tb.Context(), &financev1.DiscardInboxItemRequest{
		Id: info.ID,
	})
	if err != nil {
		tb.Fatalf("DiscardInboxItem API call failed for ID %s: %v", info.ID, err)
	}
	return f
}

func unptr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
