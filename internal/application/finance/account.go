package financeapp

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

type CreateAccountRequest struct {
	Name           string
	Type           string
	Currency       string
	InitialBalance int64
	CreditLimit    int64
	IsDefault      bool
	Color          string
	Notes          string
	LastFour       string
	InstitutionID  string
}

type UpdateAccountRequest struct {
	ID             finance.AccountID
	Name           string
	Type           string
	Currency       string
	InitialBalance int64
	CreditLimit    int64
	IsDefault      bool
	IsActive       bool
	Color          string
	Notes          string
	LastFour       string
	InstitutionID  string
	Mask           []string
	Version        int64
}

type AdjustAccountBalanceRequest struct {
	AccountID      finance.AccountID
	TargetBalance  int64
	AdjustmentDate string
	Note           string
}

func (c *coordinator) CreateAccount(ctx context.Context, req *CreateAccountRequest) (*finance.Account, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	var instID *finance.InstitutionID
	if req.InstitutionID != "" {
		instID = new(finance.InstitutionID(req.InstitutionID))
	}

	acc := &finance.Account{
		Name:           req.Name,
		Type:           finance.AccountType(req.Type),
		Currency:       finance.Currency(req.Currency),
		InitialBalance: req.InitialBalance,
		CurrentBalance: req.InitialBalance, // Initial balance sets current balance initially
		CreditLimit:    req.CreditLimit,
		IsDefault:      req.IsDefault,
		Color:          req.Color,
		Notes:          req.Notes,
		LastFour:       req.LastFour,
		InstitutionID:  instID,
	}

	return c.financeService.CreateAccount(ctx, rCtx, acc)
}

func (c *coordinator) UpdateAccount(ctx context.Context, req *UpdateAccountRequest) (*finance.Account, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	var instID *finance.InstitutionID
	if req.InstitutionID != "" {
		instID = new(finance.InstitutionID(req.InstitutionID))
	}

	acc := &finance.Account{
		ID:            req.ID,
		Name:          req.Name,
		Type:          finance.AccountType(req.Type),
		Currency:      finance.Currency(req.Currency),
		CreditLimit:   req.CreditLimit,
		IsDefault:     req.IsDefault,
		IsActive:      req.IsActive,
		Color:         req.Color,
		Notes:         req.Notes,
		LastFour:      req.LastFour,
		InstitutionID: instID,
		Version:       req.Version,
	}

	return c.financeService.UpdateAccount(ctx, rCtx, acc, req.Mask)
}

func (c *coordinator) DeleteAccount(ctx context.Context, id finance.AccountID, opts finance.DeleteOptions) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	return c.financeService.DeleteAccount(ctx, rCtx, id, opts)
}

func (c *coordinator) AdjustAccountBalance(ctx context.Context, req *AdjustAccountBalanceRequest) (*finance.Account, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.AdjustAccountBalance(ctx, rCtx, finance.AdjustAccountBalanceRequest{
		AccountID:      req.AccountID,
		TargetBalance:  req.TargetBalance,
		AdjustmentDate: req.AdjustmentDate,
		Note:           req.Note,
	})
}
