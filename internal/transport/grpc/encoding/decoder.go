package encoding

import (
	"time"

	"github.com/masterkeysrd/saturn/gen/proto/go/saturn/typepb"
	"github.com/masterkeysrd/saturn/internal/foundation/appearance"
	"github.com/masterkeysrd/saturn/internal/foundation/decimal"
	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	decimalpb "google.golang.org/genproto/googleapis/type/decimal"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
	"google.golang.org/protobuf/types/known/timestamppb"
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

func Decimal(pb *decimalpb.Decimal) (decimal.Decimal, error) {
	if pb == nil {
		return decimal.Decimal{}, nil
	}
	return decimal.FromString(pb.GetValue())
}

func DecimalPb(d decimal.Decimal) *decimalpb.Decimal {
	return &decimalpb.Decimal{
		Value: d.String(),
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

func TimestampPb(t time.Time) *timestamppb.Timestamp {
	return timestamppb.New(t)
}

func FieldMask(mask *fieldmaskpb.FieldMask) *fieldmask.FieldMask {
	if mask == nil {
		return nil
	}
	return fieldmask.NewFieldMask(mask.GetPaths()...)
}
