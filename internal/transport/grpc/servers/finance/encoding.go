package financegrpc

import (
	financepb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/transport/grpc/encoding"
)

func Budget(pb *financepb.Budget) *finance.Budget {
	if pb == nil {
		return nil
	}
	b := &finance.Budget{
		BudgetKey: finance.BudgetKey{
			ID: finance.BudgetID(pb.GetId()),
		},
		Name:       pb.GetName(),
		Appearance: encoding.Appearance(pb.GetAppearance()),
		Status:     BudgetStatus(pb.GetStatus()),
		Amount:     encoding.Money(pb.GetAmount()),
	}

	if desc := pb.GetDescription(); desc != "" {
		b.Description = &desc
	}

	return b
}

func BudgetsPb(budgets []*finance.Budget) []*financepb.Budget {
	pbs := make([]*financepb.Budget, 0, len(budgets))
	for _, b := range budgets {
		pbs = append(pbs, BudgetPb(b))
	}
	return pbs
}

func BudgetPb(b *finance.Budget) *financepb.Budget {
	if b == nil {
		return nil
	}
	pb := &financepb.Budget{
		Id:         b.ID.String(),
		Name:       b.Name,
		Appearance: encoding.AppearancePb(b.Appearance),
		Status:     BudgetStatusPb(b.Status),
		Amount:     encoding.MoneyPb(b.Amount),
	}

	if b.Description != nil {
		pb.Description = *b.Description
	}

	return pb
}

func BudgetStatus(pb financepb.Budget_Status) finance.BudgetStatus {
	switch pb {
	case financepb.Budget_ACTIVE:
		return finance.BudgetStatusActive
	case financepb.Budget_PAUSED:
		return finance.BudgetStatusPaused
	default:
		return ""
	}
}

func BudgetStatusPb(status finance.BudgetStatus) financepb.Budget_Status {
	switch status {
	case finance.BudgetStatusActive:
		return financepb.Budget_ACTIVE
	case finance.BudgetStatusPaused:
		return financepb.Budget_PAUSED
	default:
		return financepb.Budget_STATUS_UNSPECIFIED
	}
}

func ExchangeRate(pb *financepb.ExchangeRate) (*finance.ExchangeRate, error) {
	if pb == nil {
		return nil, nil
	}

	exRate := &finance.ExchangeRate{
		ExchangeRateKey: finance.ExchangeRateKey{
			CurrencyCode: finance.CurrencyCode(pb.GetCurrencyCode()),
		},
	}

	rate, err := encoding.Decimal(pb.GetRate())
	if err != nil {
		return nil, err
	}
	exRate.Rate = rate

	return exRate, nil
}

func ExchangeRatePb(e *finance.ExchangeRate) *financepb.ExchangeRate {
	if e == nil {
		return nil
	}

	return &financepb.ExchangeRate{
		CurrencyCode:   e.CurrencyCode.String(),
		Rate:           encoding.DecimalPb(e.Rate),
		IsBaseCurrency: e.IsBase,
	}
}

func Setting(pb *financepb.Setting) *finance.Setting {
	if pb == nil {
		return nil
	}

	return &finance.Setting{
		BaseCurrencyCode: finance.CurrencyCode(pb.GetBaseCurrencyCode()),
		Status:           SettingsStatus(pb.GetStatus()),
	}
}

func SettingPb(s *finance.Setting) *financepb.Setting {
	if s == nil {
		return nil
	}

	return &financepb.Setting{
		BaseCurrencyCode: s.BaseCurrencyCode.String(),
		Status:           SettingsStatusPb(s.Status),
		CreateTime:       encoding.TimestampPb(s.CreateTime),
		UpdateTime:       encoding.TimestampPb(s.UpdateTime),
	}
}

func SettingsStatus(pb financepb.Setting_Status) finance.SettingsStatus {
	switch pb {
	case financepb.Setting_ACTIVE:
		return finance.SettingStatusActive
	case financepb.Setting_DISABLED:
		return finance.SettingStatusDisabled
	case financepb.Setting_INCOMPLETE:
		return finance.SettingStatusIncomplete
	default:
		return ""
	}
}

func SettingsStatusPb(status finance.SettingsStatus) financepb.Setting_Status {
	switch status {
	case finance.SettingStatusActive:
		return financepb.Setting_ACTIVE
	case finance.SettingStatusDisabled:
		return financepb.Setting_DISABLED
	case finance.SettingStatusIncomplete:
		return financepb.Setting_INCOMPLETE
	default:
		return financepb.Setting_STATUS_UNSPECIFIED
	}
}
