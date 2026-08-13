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
	Version        int64
}

// BorrowingInfo stores registered borrowing metadata.
type BorrowingInfo struct {
	ID           string
	Counterparty string
	Direction    financev1.Borrowing_Direction
	Currency     string
	TotalAmount  int64
}

// BorrowingTransactionInfo stores registered borrowing transaction metadata.
type BorrowingTransactionInfo struct {
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

// InstitutionInfo stores registered institution metadata.
type InstitutionInfo struct {
	ID      string
	Name    string
	Domain  string
	LogoURL string
	Color   string
	Version int64
}

// State manages internal session and entity registries for a test run.
type State struct {
	T            *testing.T
	AccessToken  string
	SpaceID      string
	UserEmail    string
	UserPassword string

	Accounts              map[string]*AccountInfo
	Institutions          map[string]*InstitutionInfo
	Borrowings            map[string]*BorrowingInfo
	BorrowingTransactions map[string]*BorrowingTransactionInfo
	Transfers             map[string]*financev1.Transfer
	InboxItems            map[string]*InboxItemInfo
	Budgets               map[string]string
	ScheduledTransactions map[string]string

	LastAccount                         *AccountInfo
	LastInstitution                     *InstitutionInfo
	LastBorrowing                       *BorrowingInfo
	LastBorrowingTransaction            *BorrowingTransactionInfo
	LastTransfer                        *financev1.Transfer
	LastInboxItem                       *InboxItemInfo
	LastIntegrationID                   string
	LastTransactionID                   string
	LastRecurringTransactionID          string
	LastScheduledTransactionID          string
	LastConfirmedScheduledTransactionID string
}

func newState(t *testing.T) *State {
	return &State{
		T:                     t,
		Accounts:              make(map[string]*AccountInfo),
		Institutions:          make(map[string]*InstitutionInfo),
		Borrowings:            make(map[string]*BorrowingInfo),
		BorrowingTransactions: make(map[string]*BorrowingTransactionInfo),
		Transfers:             make(map[string]*financev1.Transfer),
		InboxItems:            make(map[string]*InboxItemInfo),
		Budgets:               make(map[string]string),
		ScheduledTransactions: make(map[string]string),
	}
}

// ClearRegistries resets all in-memory registries between tests.
func (s *State) ClearRegistries() {
	s.AccessToken = ""
	s.SpaceID = ""
	s.UserEmail = ""
	s.UserPassword = ""
	s.Accounts = make(map[string]*AccountInfo)
	s.Institutions = make(map[string]*InstitutionInfo)
	s.Borrowings = make(map[string]*BorrowingInfo)
	s.BorrowingTransactions = make(map[string]*BorrowingTransactionInfo)
	s.Transfers = make(map[string]*financev1.Transfer)
	s.InboxItems = make(map[string]*InboxItemInfo)
	s.Budgets = make(map[string]string)
	s.ScheduledTransactions = make(map[string]string)
	s.LastAccount = nil
	s.LastInstitution = nil
	s.LastBorrowing = nil
	s.LastBorrowingTransaction = nil
	s.LastTransfer = nil
	s.LastInboxItem = nil
	s.LastTransactionID = ""
	s.LastScheduledTransactionID = ""
	s.LastRecurringTransactionID = ""
	s.LastConfirmedScheduledTransactionID = ""
}
