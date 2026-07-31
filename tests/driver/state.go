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
	LastFour       string
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

// TransferInfo stores registered transfer metadata.
type TransferInfo struct {
	ID                   string
	SourceAccountID      string
	DestinationAccountID string
	SourceAmount         int64
	DestinationAmount    int64
}

// InboxItemInfo stores registered inbox item metadata.
type InboxItemInfo struct {
	ID        string
	DocType   financev1.InboxItem_DocType
	Amount    int64
	Vendor    string
	AccountID string
	BudgetID  string
}

// State manages internal session and entity registries for a test run.
type State struct {
	T            *testing.T
	AccessToken  string
	SpaceID      string
	UserEmail    string
	UserPassword string

	Accounts          map[string]*AccountInfo
	Borrowings        map[string]*BorrowingInfo
	Repayments        map[string]*RepaymentInfo
	Transfers         map[string]*financev1.Transfer
	InboxItems        map[string]*InboxItemInfo
	Budgets           map[string]string
	ScheduledPayments map[string]string

	LastAccount                     *AccountInfo
	LastBorrowing                   *BorrowingInfo
	LastRepayment                   *RepaymentInfo
	LastTransfer                    *financev1.Transfer
	LastInboxItem                   *InboxItemInfo
	LastIntegrationID               string
	LastTransactionID               string
	LastRecurringExpenseID          string
	LastScheduledPaymentID          string
	LastConfirmedScheduledPaymentID string
}

func newState(t *testing.T) *State {
	return &State{
		T:                 t,
		Accounts:          make(map[string]*AccountInfo),
		Borrowings:        make(map[string]*BorrowingInfo),
		Repayments:        make(map[string]*RepaymentInfo),
		Transfers:         make(map[string]*financev1.Transfer),
		InboxItems:        make(map[string]*InboxItemInfo),
		Budgets:           make(map[string]string),
		ScheduledPayments: make(map[string]string),
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
	s.Transfers = make(map[string]*financev1.Transfer)
	s.InboxItems = make(map[string]*InboxItemInfo)
	s.Budgets = make(map[string]string)
	s.ScheduledPayments = make(map[string]string)
	s.LastAccount = nil
	s.LastBorrowing = nil
	s.LastRepayment = nil
	s.LastTransfer = nil
	s.LastInboxItem = nil
	s.LastTransactionID = ""
	s.LastScheduledPaymentID = ""
	s.LastRecurringExpenseID = ""
	s.LastConfirmedScheduledPaymentID = ""
}
