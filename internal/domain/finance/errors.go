package finance

import "errors"

// Sentinel errors for core finance domain operations.
var (
	ErrSettingsNotFound                                       = errors.New("finance settings not found")
	ErrBudgetNotFound                                         = errors.New("budget not found")
	ErrPeriodNotFound                                         = errors.New("budget period not found")
	ErrExchangeRateNotFound                                   = errors.New("exchange rate not found")
	ErrTransactionNotFound                                    = errors.New("transaction not found")
	ErrBorrowingNotFound                                      = errors.New("borrowing not found")
	ErrRepaymentNotFound                                      = errors.New("borrowing repayment not found")
	ErrAccountNotFound                                        = errors.New("account not found")
	ErrTransferNotFound                                       = errors.New("transfer not found")
	ErrCannotDeleteDefaultAccount                             = errors.New("cannot delete the default account. please select another account as default first")
	ErrBudgetVersionMismatch                                  = errors.New("update failed: budget not found or version mismatch")
	ErrBudgetHasTransactions                                  = errors.New("cannot delete budget with existing transactions. deactivate it instead")
	ErrBudgetHasScheduledTransactions                         = errors.New("cannot delete budget with active scheduled transactions. cancel or reassign scheduled transactions first")
	ErrCannotLinkReceiptToTransfer                            = errors.New("cannot link receipt to transfer transaction")
	ErrCannotRelinkTransactionToDifferentBorrowing            = errors.New("cannot relink transaction to a different borrowing agreement")
	ErrCannotRelinkTransactionToDifferentScheduledTransaction = errors.New("cannot relink transaction to a different scheduled transaction")
	ErrAccountVersionMismatch                                 = errors.New("update failed: account not found or version mismatch")
	ErrInstitutionVersionMismatch                             = errors.New("update failed: institution not found or version mismatch")
	ErrBorrowingVersionMismatch                               = errors.New("update failed: borrowing not found or version mismatch")
	ErrRecurringTransactionVersionMismatch                    = errors.New("update failed: recurring transaction not found or version mismatch")
	ErrBorrowingHasTransactions                               = errors.New("cannot delete borrowing agreement with linked transactions")
	ErrStatementNotFound                                      = errors.New("reconciliation statement not found")
	ErrStatementLineNotFound                                  = errors.New("reconciliation statement line not found")
	ErrStatementVersionMismatch                               = errors.New("update failed: statement not found or version mismatch")
	ErrStatementLineVersionMismatch                           = errors.New("update failed: statement line not found or version mismatch")
	ErrActiveStatementAlreadyExists                           = errors.New("an active statement reconciliation is already in progress for this account")
	ErrStatementBalanceMismatch                               = errors.New("statement finalization failed: cash flow sum of matches does not equal statement balance difference")
)
