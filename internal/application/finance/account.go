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
}

func (c *Coordinator) CreateAccount(ctx context.Context, req *CreateAccountRequest) (*finance.Account, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
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
	}

	return c.financeService.CreateAccount(ctx, acc)
}

func (c *Coordinator) GetAccount(ctx context.Context, id finance.AccountID) (*finance.Account, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	acc, err := c.financeService.GetAccount(ctx, id)
	if err != nil {
		return nil, err
	}

	if acc.SpaceID != rCtx.SpaceID {
		return nil, finance.ErrAccountNotFound
	}

	return acc, nil
}

func (c *Coordinator) UpdateAccount(ctx context.Context, req *UpdateAccountRequest) (*finance.Account, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	acc := &finance.Account{
		ID:             req.ID,
		SpaceID:        rCtx.SpaceID,
		Name:           req.Name,
		Type:           finance.AccountType(req.Type),
		Currency:       finance.Currency(req.Currency),
		InitialBalance: req.InitialBalance,
		CreditLimit:    req.CreditLimit,
		IsDefault:      req.IsDefault,
		IsActive:       req.IsActive,
		Color:          req.Color,
		Notes:          req.Notes,
		LastFour:       req.LastFour,
	}

	return c.financeService.UpdateAccount(ctx, acc)
}

func (c *Coordinator) DeleteAccount(ctx context.Context, id finance.AccountID) error {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return err
	}

	acc, err := c.financeService.GetAccount(ctx, id)
	if err != nil {
		return err
	}

	if acc.SpaceID != rCtx.SpaceID {
		return finance.ErrAccountNotFound
	}

	return c.financeService.DeleteAccount(ctx, id)
}

func (c *Coordinator) ListAccounts(ctx context.Context) ([]*finance.Account, error) {
	rCtx, err := c.resolveContext(ctx)
	if err != nil {
		return nil, err
	}

	return c.financeService.ListAccounts(ctx, rCtx.SpaceID)
}
