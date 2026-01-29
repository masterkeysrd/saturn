package financegrpc

import (
	financepb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/foundation/paging"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
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

func SearchBudgetsInput(pb *financepb.ListBudgetsRequest) *finance.SearchBudgetsInput {
	if pb == nil {
		return nil
	}

	return &finance.SearchBudgetsInput{
		View:          BudgetView(pb.GetView()),
		Term:          pb.GetSearch(),
		PagingRequest: paging.FromSource(pb),
	}
}

func FindBudgetInput(pb *financepb.GetBudgetRequest) *finance.FindBudgetInput {
	if pb == nil {
		return nil
	}

	return &finance.FindBudgetInput{
		ID:   finance.BudgetID(pb.GetId()),
		View: BudgetView(pb.GetView()),
	}
}

func UpdateBudgetInput(pb *financepb.UpdateBudgetRequest) (*finance.UpdateBudgetInput, error) {
	if pb == nil {
		return nil, nil
	}

	budget := Budget(pb.GetBudget())
	mask := encoding.FieldMask(pb.GetUpdateMask())
	return &finance.UpdateBudgetInput{
		ID:         finance.BudgetID(pb.GetId()),
		Budget:     budget,
		UpdateMask: mask,
	}, nil
}

func BudgetsItemsPb(budgets []*finance.BudgetItem) []*financepb.Budget {
	pbs := make([]*financepb.Budget, 0, len(budgets))
	for _, b := range budgets {
		pbs = append(pbs, BudgetItemPb(b))
	}
	return pbs
}

func BudgetItemPb(b *finance.BudgetItem) *financepb.Budget {
	if b == nil {
		return nil
	}
	pb := &financepb.Budget{
		Id:           b.ID.String(),
		Name:         b.Name,
		Description:  ptr.Value(b.Description),
		Appearance:   encoding.AppearancePb(b.Appearance),
		Status:       BudgetStatusPb(b.Status),
		Amount:       encoding.MoneyPb(b.Amount),
		BaseAmount:   encoding.MoneyPb(b.BaseAmount),
		ExchangeRate: encoding.DecimalPb(b.ExchangeRate),
		CreateTime:   encoding.TimestampPb(b.CreateTime),
		UpdateTime:   encoding.TimestampPb(b.UpdateTime),
	}

	if b.Stats != nil {
		pb.Stats = &financepb.Budget_Stats{
			PeriodStart:      encoding.DatePb(b.Stats.PeriodStart),
			PeriodEnd:        encoding.DatePb(b.Stats.PeriodEnd),
			SpentAmount:      encoding.MoneyPb(b.Stats.Spent),
			RemainingAmount:  encoding.MoneyPb(b.Stats.Remaining(b.Amount)),
			UsagePercentage:  b.Stats.Usage(b.Amount),
			TransactionCount: int32(b.Stats.TrxCount),
		}
	}

	return pb
}

func BudgetView(pb financepb.Budget_View) finance.BudgetView {
	switch pb {
	case financepb.Budget_NAME_ONLY:
		return finance.BudgetViewNameOnly
	case financepb.Budget_BASIC:
		return finance.BudgetViewBasic
	case financepb.Budget_FULL:
		return finance.BudgetViewFull
	default:
		return finance.BudgetViewBasic
	}
}

func CurrenciesPb(currencies []finance.Currency) []*financepb.Currency {
	pbs := make([]*financepb.Currency, 0, len(currencies))
	for _, c := range currencies {
		pbs = append(pbs, CurrencyPb(c))
	}
	return pbs
}

func CurrencyPb(c finance.Currency) *financepb.Currency {
	return &financepb.Currency{
		Code:          c.Code.String(),
		Name:          c.Name,
		Symbol:        c.Symbol,
		DecimalPlaces: int32(c.DecimalPlaces),
	}
}

func ExchangeRatesPb(rates []*finance.ExchangeRate) []*financepb.ExchangeRate {
	pbs := make([]*financepb.ExchangeRate, 0, len(rates))
	for _, r := range rates {
		pbs = append(pbs, ExchangeRatePb(r))
	}
	return pbs
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

func UpdateExchangeRateInput(pb *financepb.UpdateExchangeRateRequest) (*finance.UpdateExchangeRateInput, error) {
	if pb == nil {
		return nil, nil
	}

	exRate, err := ExchangeRate(pb.GetRate())
	if err != nil {
		return nil, err
	}

	exRate.CurrencyCode = finance.CurrencyCode(pb.CurrencyCode)

	mask := encoding.FieldMask(pb.GetUpdateMask())

	// Remap "rate.value" to "rate" in the update mask,
	// since the Rate field is represented as a Decimal struct
	// in the domain model, not as a nested message. Also,
	// this decouples the internal representation from the protobuf schema.
	mask.ReplacePath("rate.value", "rate")

	return &finance.UpdateExchangeRateInput{
		ExchangeRate: exRate,
		UpdateMask:   mask,
	}, nil
}

func Expense(pb *financepb.Expense) (*finance.Expense, error) {
	if pb == nil {
		return nil, nil
	}

	exchangeRate, err := encoding.DecimalPtr(pb.GetExchangeRate())
	if err != nil {
		return nil, err
	}

	return &finance.Expense{
		ID:       finance.TransactionID(pb.GetId()),
		BudgetID: finance.BudgetID(pb.GetBudgetId()),
		Operation: finance.Operation{
			Title:         pb.GetTitle(),
			Description:   pb.GetDescription(),
			Amount:        encoding.Money(pb.GetAmount()),
			Date:          encoding.Date(pb.GetDate()),
			EffectiveDate: encoding.DatePtr(pb.GetEffectiveDate()),
			ExchangeRate:  exchangeRate,
		},
	}, nil
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

func TransactionPb(t *finance.Transaction) *financepb.Transaction {
	if t == nil {
		return nil
	}

	pb := &financepb.Transaction{
		Id:            t.ID.String(),
		Type:          TransactionTypePb(t.Type),
		Date:          encoding.DatePb(t.Date),
		EffectiveDate: encoding.DatePb(t.EffectiveDate),
		Amount:        encoding.MoneyPb(t.Amount),
		BaseAmount:    encoding.MoneyPb(t.BaseAmount),
		ExchangeRate:  encoding.DecimalPb(t.ExchangeRate),
		CreateTime:    encoding.TimestampPb(t.CreateTime),
		UpdateTime:    encoding.TimestampPb(t.UpdateTime),
	}

	if t.BudgetID != nil {
		pb.Budget = &financepb.Transaction_BudgetInfo{
			BudgetId: t.BudgetID.String(),
		}
	}

	return pb
}

func TransactionTypePb(t finance.TransactionType) financepb.Transaction_Type {
	switch t {
	case finance.TransactionTypeExpense:
		return financepb.Transaction_EXPENSE
	default:
		return financepb.Transaction_TYPE_UNSPECIFIED
	}
}

func TransactionsItemsPb(trxs []*finance.TransactionItem) []*financepb.Transaction {
	pbs := make([]*financepb.Transaction, 0, len(trxs))
	for _, t := range trxs {
		pbs = append(pbs, TransactionItemPb(t))
	}
	return pbs
}

func TransactionItemPb(t *finance.TransactionItem) *financepb.Transaction {
	if t == nil {
		return nil
	}

	pb := &financepb.Transaction{
		Id:   t.ID.String(),
		Type: TransactionTypePb(t.Type),
	}

	return pb
}

func SearchTransactionsInput(pb *financepb.ListTransactionsRequest) *finance.SearchTransactionsInput {
	if pb == nil {
		return nil
	}

	return &finance.SearchTransactionsInput{}
}
