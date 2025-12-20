package financepg

import (
	"context"
	"errors"
	"fmt"
	"log"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/appearance"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

var _ finance.BudgetStore = (*BudgetStore)(nil)

type BudgetStore struct {
	db *sqlx.DB
}

func NewBudgetStore(db *sqlx.DB) *BudgetStore {
	return &BudgetStore{
		db: db,
	}
}

func (b *BudgetStore) Get(ctx context.Context, key finance.BudgetKey) (*finance.Budget, error) {
	entity, err := GetBudgetByID(ctx, b.db, &GetBudgetByIDParams{
		Id:      key.ID.String(),
		SpaceId: key.SpaceID.String(),
	})
	if err != nil {
		return nil, fmt.Errorf("cannot get budget: %w", err)
	}

	return entity.ToModel(), nil
}

func (b *BudgetStore) List(ctx context.Context, spaceID space.ID) ([]*finance.Budget, error) {
	log.Printf("Listing budgets for space ID: %s", spaceID.String())
	budgets := make([]*finance.Budget, 0, 20) // initial capacity of 20
	if err := ListBudgets(ctx, b.db, &ListBudgetsParams{
		SpaceId: spaceID.String(),
	}, func(e *BudgetEntity) error {
		budgets = append(budgets, e.ToModel())
		return nil
	}); err != nil {
		return nil, fmt.Errorf("cannot list budgets: %w", err)
	}

	return budgets, nil
}

func (b *BudgetStore) Store(ctx context.Context, budget *finance.Budget) error {

	entity, err := UpsertBudget(ctx, b.db, BudgetEntityFromModel(budget))
	if err != nil {
		return fmt.Errorf("cannot store budget: %w", err)
	}

	// Update the budget model with any changes from the database (e.g., generated IDs)
	*budget = *entity.ToModel()
	return nil
}

// Delete removes a single Budget record by its Key.
func (b *BudgetStore) Delete(ctx context.Context, key finance.BudgetKey) error {
	result, err := DeleteBudgetByID(ctx, b.db, &DeleteBudgetByIDParams{
		Id:      key.ID.String(),
		SpaceId: key.SpaceID.String(),
	})
	if err != nil {
		return fmt.Errorf("cannot delete budget: %w", err)
	}

	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("cannot get affected rows: %w", err)
	}

	if affected == 0 {
		return errors.New("budget not found")
	}

	return nil
}

// Delete returns the SQL query for deleting a budget by ID.

func BudgetEntityFromModel(b *finance.Budget) *BudgetEntity {
	return &BudgetEntity{
		Id:             b.ID.String(),
		SpaceId:        b.SpaceID.String(),
		Name:           b.Name,
		Description:    b.Description,
		Color:          b.Color.String(),
		IconName:       b.Icon.String(),
		Status:         b.Status.String(),
		AmountCurrency: b.Amount.Currency.String(),
		AmountCents:    b.Amount.Cents.Int64(),
		CreateTime:     b.CreateTime,
		CreateBy:       b.CreateBy.String(),
		UpdateTime:     b.UpdateTime,
		UpdateBy:       b.UpdateBy.String(),
	}
}

func (e *BudgetEntity) ToModel() *finance.Budget {
	return &finance.Budget{
		BudgetKey: finance.BudgetKey{
			ID:      finance.BudgetID(e.Id),
			SpaceID: space.ID(e.SpaceId),
		},
		Name:        e.Name,
		Description: e.Description,
		Appearance: appearance.Appearance{
			Color: appearance.Color(e.Color),
			Icon:  appearance.Icon(e.IconName),
		},
		Status: finance.BudgetStatus(e.Status),
		Amount: money.Money{
			Currency: money.CurrencyCode(e.AmountCurrency),
			Cents:    money.Cents(e.AmountCents),
		},
		CreateTime: e.CreateTime,
		CreateBy:   auth.UserID(e.CreateBy),
		UpdateTime: e.UpdateTime,
		UpdateBy:   auth.UserID(e.UpdateBy),
	}
}
