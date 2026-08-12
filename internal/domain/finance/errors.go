package finance

import "errors"

// Sentinel errors for core finance domain operations.
var (
	ErrSettingsNotFound                                   = errors.New("finance settings not found")
	ErrBudgetNotFound                                     = errors.New("budget not found")
	ErrPeriodNotFound                                     = errors.New("budget period not found")
	ErrExchangeRateNotFound                               = errors.New("exchange rate not found")
	ErrTransactionNotFound                                = errors.New("transaction not found")
	ErrBorrowingNotFound                                  = errors.New("borrowing not found")
	ErrRepaymentNotFound                                  = errors.New("borrowing repayment not found")
	ErrAccountNotFound                                    = errors.New("account not found")
	ErrTransferNotFound                                   = errors.New("transfer not found")
	ErrCannotDeleteDefaultAccount                         = errors.New("cannot delete the default account. please select another account as default first")
	ErrBudgetVersionMismatch                              = errors.New("update failed: budget not found or version mismatch")
	ErrBudgetHasTransactions                              = errors.New("cannot delete budget with existing transactions. deactivate it instead")
	ErrBudgetHasScheduledPayments                         = errors.New("cannot delete budget with active scheduled payments. cancel or reassign scheduled payments first")
	ErrCannotLinkReceiptToTransfer                        = errors.New("cannot link receipt to transfer transaction")
	ErrCannotRelinkTransactionToDifferentBorrowing        = errors.New("cannot relink transaction to a different borrowing agreement")
	ErrCannotRelinkTransactionToDifferentScheduledPayment = errors.New("cannot relink transaction to a different scheduled payment")
	ErrAccountVersionMismatch                             = errors.New("update failed: account not found or version mismatch")
	ErrInstitutionVersionMismatch                         = errors.New("update failed: institution not found or version mismatch")
)
