package encoding

import (
	"github.com/masterkeysrd/saturn/gen/proto/go/saturn/typepb"
	"github.com/masterkeysrd/saturn/internal/foundation/appearance"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
)

func Appearance(pb *typepb.Appearance) appearance.Appearance {
	if pb == nil {
		return appearance.Appearance{}
	}
	return appearance.Appearance{
		Color: appearance.Color(pb.GetColor()),
		Icon:  appearance.Icon(pb.GetIcon()),
	}
}

func AppearancePb(a appearance.Appearance) *typepb.Appearance {
	return &typepb.Appearance{
		Color: a.Color.String(),
		Icon:  a.Icon.String(),
	}
}

func Money(pb *typepb.Money) money.Money {
	if pb == nil {
		return money.Money{}
	}
	return money.Money{
		Currency: money.CurrencyCode(pb.GetCurrencyCode()),
		Cents:    money.Cents(pb.GetCents()),
	}
}

func MoneyPb(m money.Money) *typepb.Money {
	return &typepb.Money{
		CurrencyCode: m.Currency.String(),
		Cents:        m.Cents.Int64(),
	}
}
