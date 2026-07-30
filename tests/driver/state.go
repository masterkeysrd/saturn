package driver

import "testing"

// AccountInfo stores registered account metadata.
type AccountInfo struct {
	ID             string
	Name           string
	Type           string
	Currency       string
	InitialBalance int64
}

// BorrowingInfo stores registered borrowing metadata.
type BorrowingInfo struct {
	ID           string
	Counterparty string
	Direction    string
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

	LastAccount   *AccountInfo
	LastBorrowing *BorrowingInfo
	LastRepayment *RepaymentInfo
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
}
