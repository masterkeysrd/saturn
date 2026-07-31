package driver

import (
	"testing"

	financev1 "github.com/masterkeysrd/saturn/apis/saturn/finance/v1"
)

// AccountInfo stores registered account metadata.
type AccountInfo struct {
	ID             string
	Name           string
	Type           financev1.Account_Type
	Currency       string
	InitialBalance int64
}

// BorrowingInfo stores registered borrowing metadata.
type BorrowingInfo struct {
	ID           string
	Counterparty string
	Direction    financev1.Borrowing_Direction
	Currency     string
	TotalAmount  int64
}

// RepaymentInfo stores registered repayment metadata.
type RepaymentInfo struct {
	ID          string
	BorrowingID string
	AccountID   string
	Amount      int64
}

// State manages internal session and entity registries for a test run.
type State struct {
	T            *testing.T
	AccessToken  string
	SpaceID      string
	UserEmail    string
	UserPassword string

	Accounts   map[string]*AccountInfo
	Borrowings map[string]*BorrowingInfo
	Repayments map[string]*RepaymentInfo
	Budgets    map[string]string

	LastAccount                     *AccountInfo
	LastBorrowing                   *BorrowingInfo
	LastRepayment                   *RepaymentInfo
	LastTransaction                 *financev1.Transaction
	LastRecurringExpenseID          string
	LastConfirmedScheduledPaymentID string
}

func newState(t *testing.T) *State {
	return &State{
		T:          t,
		Accounts:   make(map[string]*AccountInfo),
		Borrowings: make(map[string]*BorrowingInfo),
		Repayments: make(map[string]*RepaymentInfo),
		Budgets:    make(map[string]string),
	}
}

// ClearRegistries resets all in-memory registries between tests.
func (s *State) ClearRegistries() {
	s.AccessToken = ""
	s.SpaceID = ""
	s.UserEmail = ""
	s.UserPassword = ""
	s.Accounts = make(map[string]*AccountInfo)
	s.Borrowings = make(map[string]*BorrowingInfo)
	s.Repayments = make(map[string]*RepaymentInfo)
	s.Budgets = make(map[string]string)
	s.LastAccount = nil
	s.LastBorrowing = nil
	s.LastRepayment = nil
	s.LastTransaction = nil
}
