package financepg

import (
	"context"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
)

var _ finance.ExchangeRateStore = (*ExchangeRateStore)(nil)

type ExchangeRateStore struct {
	db *sqlx.DB
}

func NewExchangeRateStore(db *sqlx.DB) *ExchangeRateStore {
	return &ExchangeRateStore{db: db}
}

func (e *ExchangeRateStore) Get(ctx context.Context, key finance.ExchangeRateKey) (*finance.ExchangeRate, error) {
	row, err := GetExchangeRate(ctx, e.db, &GetExchangeRateParams{
		SpaceId:      key.SpaceID.String(),
		CurrencyCode: key.CurrencyCode.String(),
	})
	if err != nil {
		return nil, err
	}

	return row.ToModel(), nil
}

func (e *ExchangeRateStore) Exists(ctx context.Context, key finance.ExchangeRateKey) (bool, error) {
	exists, err := ExistsExchangeRate(ctx, e.db, &ExistsExchangeRateParams{
		SpaceId:      key.SpaceID.String(),
		CurrencyCode: key.CurrencyCode.String(),
	})
	if err != nil {
		return false, err
	}
	return exists, nil
}

func (e *ExchangeRateStore) List(ctx context.Context, spaceID space.ID) ([]*finance.ExchangeRate, error) {
	rows := make([]*finance.ExchangeRate, 0, 20)

	if err := ListExchangeRatesBySpaceID(ctx, e.db, &ListExchangeRatesBySpaceIDParams{
		SpaceId: spaceID.String(),
	}, func(entity *ExchangeRateEntity) error {
		rows = append(rows, entity.ToModel())
		return nil
	}); err != nil {
		return nil, err
	}

	return rows, nil
}

func (e *ExchangeRateStore) Store(ctx context.Context, exchangeRate *finance.ExchangeRate) error {
	row, err := UpsertExchangeRate(ctx, e.db, ExchangeRateEntityFromModel(exchangeRate))
	if err != nil {
		return err
	}

	updatedExchangeRate := row.ToModel()
	*exchangeRate = *updatedExchangeRate

	return nil
}

func ExchangeRateEntityFromModel(model *finance.ExchangeRate) *ExchangeRateEntity {
	return &ExchangeRateEntity{
		SpaceId:      model.SpaceID.String(),
		CurrencyCode: model.CurrencyCode.String(),
		Rate:         model.Rate,
		IsBase:       model.IsBase,
		CreateTime:   model.CreateTime,
		CreateBy:     model.CreateBy.String(),
		UpdateTime:   model.UpdateTime,
		UpdateBy:     model.UpdateBy.String(),
	}
}

func (e *ExchangeRateEntity) ToModel() *finance.ExchangeRate {
	return &finance.ExchangeRate{
		ExchangeRateKey: finance.ExchangeRateKey{
			SpaceID:      space.ID(e.SpaceId),
			CurrencyCode: finance.CurrencyCode(e.CurrencyCode),
		},
		Rate:       e.Rate,
		IsBase:     e.IsBase,
		UpdateTime: e.UpdateTime,
		UpdateBy:   access.UserID(e.UpdateBy),
	}
}
