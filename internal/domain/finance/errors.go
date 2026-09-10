package finance

import "github.com/masterkeysrd/saturn/internal/platform/errors"

// Error codes for the finance domain.
const (
	SettingsNotFound                                       errors.Code = "FINANCE_SETTINGS_NOT_FOUND"
	BudgetNotFound                                         errors.Code = "BUDGET_NOT_FOUND"
	PeriodNotFound                                         errors.Code = "BUDGET_PERIOD_NOT_FOUND"
	ExchangeRateNotFound                                   errors.Code = "EXCHANGE_RATE_NOT_FOUND"
	TransactionNotFound                                    errors.Code = "TRANSACTION_NOT_FOUND"
	ScheduledTransactionNotFound                           errors.Code = "SCHEDULED_TRANSACTION_NOT_FOUND"
	BorrowingNotFound                                      errors.Code = "BORROWING_NOT_FOUND"
	RepaymentNotFound                                      errors.Code = "BORROWING_REPAYMENT_NOT_FOUND"
	AccountNotFound                                        errors.Code = "ACCOUNT_NOT_FOUND"
	TransferNotFound                                       errors.Code = "TRANSFER_NOT_FOUND"
	StatementNotFound                                      errors.Code = "STATEMENT_NOT_FOUND"
	StatementLineNotFound                                  errors.Code = "STATEMENT_LINE_NOT_FOUND"
	InstitutionNotFound                                    errors.Code = "INSTITUTION_NOT_FOUND"
	InboxItemNotFound                                      errors.Code = "INBOX_ITEM_NOT_FOUND"
	CannotDeleteDefaultAccount                             errors.Code = "CANNOT_DELETE_DEFAULT_ACCOUNT"
	BudgetHasTransactions                                  errors.Code = "BUDGET_HAS_TRANSACTIONS"
	BudgetHasScheduledTransactions                         errors.Code = "BUDGET_HAS_SCHEDULED_TRANSACTIONS"
	CannotLinkReceiptToTransfer                            errors.Code = "CANNOT_LINK_RECEIPT_TO_TRANSFER"
	CannotRelinkTransactionToDifferentBorrowing            errors.Code = "CANNOT_RELINK_TRANSACTION_TO_DIFFERENT_BORROWING"
	CannotRelinkTransactionToDifferentScheduledTransaction errors.Code = "CANNOT_RELINK_TRANSACTION_TO_DIFFERENT_SCHEDULED_TRANSACTION"
	BorrowingHasTransactions                               errors.Code = "BORROWING_HAS_TRANSACTIONS"
	ActiveStatementExists                                  errors.Code = "ACTIVE_STATEMENT_EXISTS"
	StatementBalanceMismatch                               errors.Code = "STATEMENT_BALANCE_MISMATCH"
	CannotInvertCompletedStatement                         errors.Code = "CANNOT_INVERT_COMPLETED_STATEMENT"
	VersionMismatch                                        errors.Code = "FINANCE_VERSION_MISMATCH"

	// Entity-specific version mismatch aliases for convenience
	BudgetVersionMismatch               errors.Code = VersionMismatch
	AccountVersionMismatch              errors.Code = VersionMismatch
	InstitutionVersionMismatch          errors.Code = VersionMismatch
	BorrowingVersionMismatch            errors.Code = VersionMismatch
	RecurringTransactionVersionMismatch errors.Code = VersionMismatch
	StatementVersionMismatch            errors.Code = VersionMismatch
	StatementLineVersionMismatch        errors.Code = VersionMismatch
)
