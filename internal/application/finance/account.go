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

func (c *Coordinator) CreateAccount(ctx context.Context, req *CreateAccountRequest) (*finance.Account, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	var instID *finance.InstitutionID
	if req.InstitutionID != "" {
		instID = new(finance.InstitutionID(req.InstitutionID))
	}

	acc := &finance.Account{
		SpaceID:        rCtx.SpaceID,
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

	return c.financeService.CreateAccount(ctx, acc)
}

func (c *Coordinator) UpdateAccount(ctx context.Context, req *UpdateAccountRequest) (*finance.Account, error) {
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
		SpaceID:       rCtx.SpaceID,
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

	return c.financeService.UpdateAccount(ctx, acc, req.Mask)
}

func (c *Coordinator) DeleteAccount(ctx context.Context, id finance.AccountID, opts finance.DeleteOptions) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	return c.financeService.DeleteAccount(ctx, rCtx.SpaceID, id, opts)
}

func (c *Coordinator) AdjustAccountBalance(ctx context.Context, id finance.AccountID, targetBalance int64, adjustmentDate string, note string) (*finance.Account, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.AdjustAccountBalance(ctx, rCtx.SpaceID, id, targetBalance, adjustmentDate, note)
}
