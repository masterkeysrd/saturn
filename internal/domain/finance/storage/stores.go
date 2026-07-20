package storage

import (
	"context"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// --- FinanceSettings Store ---

type settingsDB struct {
	SpaceID      string       `db:"space_id"`
	BaseCurrency string       `db:"base_currency"`
	CreateTime   sql.NullTime `db:"create_time"`
	UpdateTime   sql.NullTime `db:"update_time"`
}

type SettingsStore struct {
	db *sqlx.DB
}

func NewSettingsStore(db *sqlx.DB) *SettingsStore {
	return &SettingsStore{db: db}
}

func (s *SettingsStore) Create(ctx context.Context, settings *finance.FinanceSettings) error {
	query := `INSERT INTO finance.settings (space_id, base_currency, create_time, update_time)
		VALUES ($1, $2, $3, $4)`
	_, err := s.db.ExecContext(ctx, query, string(settings.SpaceID), settings.BaseCurrency, settings.CreateTime, settings.UpdateTime)
	return err
}

func (s *SettingsStore) GetByID(ctx context.Context, spaceID finance.SpaceID) (*finance.FinanceSettings, error) {
	var row settingsDB
	query := `SELECT space_id, base_currency, create_time, update_time FROM finance.settings WHERE space_id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(spaceID)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrSettingsNotFound
		}
		return nil, err
	}
	return &finance.FinanceSettings{
		SpaceID:      finance.SpaceID(row.SpaceID),
		BaseCurrency: finance.Currency(row.BaseCurrency),
		CreateTime:   nullTimeToTime(row.CreateTime),
		UpdateTime:   nullTimeToTime(row.UpdateTime),
	}, nil
}

// --- Budget Store ---

type budgetDB struct {
	ID          string       `db:"id"`
	SpaceID     string       `db:"space_id"`
	Name        string       `db:"name"`
	LimitAmount int64        `db:"limit_amount"`
	Currency    string       `db:"currency"`
	Interval    string       `db:"interval"`
	IsActive    bool         `db:"is_active"`
	Icon        string       `db:"icon"`
	Color       string       `db:"color"`
	CreateTime  sql.NullTime `db:"create_time"`
	UpdateTime  sql.NullTime `db:"update_time"`
}

type BudgetStore struct {
	db *sqlx.DB
}

func NewBudgetStore(db *sqlx.DB) *BudgetStore {
	return &BudgetStore{db: db}
}

func (s *BudgetStore) Create(ctx context.Context, b *finance.Budget) error {
	query := `INSERT INTO finance.budget (id, space_id, name, limit_amount, currency, interval, is_active, icon, color, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`
	_, err := s.db.ExecContext(ctx, query, string(b.ID), string(b.SpaceID), b.Name, b.LimitAmount, string(b.Currency), string(b.Interval), b.IsActive, b.Icon, b.Color, b.CreateTime, b.UpdateTime)
	return err
}

func (s *BudgetStore) GetByID(ctx context.Context, id finance.BudgetID) (*finance.Budget, error) {
	var row budgetDB
	query := `SELECT * FROM finance.budget WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrBudgetNotFound
		}
		return nil, err
	}
	return &finance.Budget{
		ID:          finance.BudgetID(row.ID),
		SpaceID:     finance.SpaceID(row.SpaceID),
		Name:        row.Name,
		LimitAmount: row.LimitAmount,
		Currency:    finance.Currency(row.Currency),
		Interval:    finance.RecurrenceInterval(row.Interval),
		IsActive:    row.IsActive,
		Icon:        row.Icon,
		Color:       row.Color,
		CreateTime:  nullTimeToTime(row.CreateTime),
		UpdateTime:  nullTimeToTime(row.UpdateTime),
	}, nil
}

func (s *BudgetStore) Update(ctx context.Context, b *finance.Budget) error {
	query := `UPDATE finance.budget 
		SET name = $1, limit_amount = $2, currency = $3, interval = $4, is_active = $5, icon = $6, color = $7, update_time = $8 
		WHERE id = $9`
	res, err := s.db.ExecContext(ctx, query, b.Name, b.LimitAmount, string(b.Currency), string(b.Interval), b.IsActive, b.Icon, b.Color, b.UpdateTime, string(b.ID))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrBudgetNotFound
	}
	return nil
}

func (s *BudgetStore) Delete(ctx context.Context, id finance.BudgetID) error {
	query := `DELETE FROM finance.budget WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrBudgetNotFound
	}
	return nil
}

func (s *BudgetStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListBudgetsFilter) ([]*finance.Budget, string, error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	var cursorID string
	if filter.NextPageToken != "" {
		if decoded, err := base64.URLEncoding.DecodeString(filter.NextPageToken); err == nil {
			cursorID = string(decoded)
		}
	}

	conditions := []string{"space_id = $1"}
	args := []any{string(spaceID)}
	argIndex := 2

	if cursorID != "" {
		conditions = append(conditions, fmt.Sprintf("id > $%d", argIndex))
		args = append(args, cursorID)
		argIndex++
	}

	query := fmt.Sprintf(`SELECT * FROM finance.budget WHERE %s ORDER BY id LIMIT $%d`, strings.Join(conditions, " AND "), argIndex)
	args = append(args, filter.PageSize+1)

	var rows []budgetDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(rows) > int(filter.PageSize)
	if hasMore {
		rows = rows[:filter.PageSize]
	}

	budgets := make([]*finance.Budget, 0, len(rows))
	for i := range rows {
		budgets = append(budgets, &finance.Budget{
			ID:          finance.BudgetID(rows[i].ID),
			SpaceID:     finance.SpaceID(rows[i].SpaceID),
			Name:        rows[i].Name,
			LimitAmount: rows[i].LimitAmount,
			Currency:    finance.Currency(rows[i].Currency),
			Interval:    finance.RecurrenceInterval(rows[i].Interval),
			IsActive:    rows[i].IsActive,
			Icon:        rows[i].Icon,
			Color:       rows[i].Color,
			CreateTime:  nullTimeToTime(rows[i].CreateTime),
			UpdateTime:  nullTimeToTime(rows[i].UpdateTime),
		})
	}

	var nextToken string
	if hasMore && len(rows) > 0 {
		lastBudget := rows[len(rows)-1]
		nextToken = base64.URLEncoding.EncodeToString([]byte(lastBudget.ID))
	}

	return budgets, nextToken, nil
}

// --- BudgetPeriod Store ---

type periodDB struct {
	ID                 string       `db:"id"`
	BudgetID           string       `db:"budget_id"`
	SpaceID            string       `db:"space_id"`
	StartDate          time.Time    `db:"start_date"`
	EndDate            time.Time    `db:"end_date"`
	LimitAmount        int64        `db:"limit_amount"`
	Currency           string       `db:"currency"`
	BaseCurrency       string       `db:"base_currency"`
	ExchangeRateToBase float64      `db:"exchange_rate_to_base"`
	CreateTime         sql.NullTime `db:"create_time"`
	UpdateTime         sql.NullTime `db:"update_time"`
}

type PeriodStore struct {
	db *sqlx.DB
}

func NewPeriodStore(db *sqlx.DB) *PeriodStore {
	return &PeriodStore{db: db}
}

func (s *PeriodStore) Create(ctx context.Context, p *finance.BudgetPeriod) error {
	query := `INSERT INTO finance.budget_period (id, budget_id, space_id, start_date, end_date, limit_amount, currency, base_currency, exchange_rate_to_base, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`
	_, err := s.db.ExecContext(ctx, query, string(p.ID), string(p.BudgetID), string(p.SpaceID), p.StartDate, p.EndDate, p.LimitAmount, p.Currency, p.BaseCurrency, p.ExchangeRateToBase, p.CreateTime, p.UpdateTime)
	return err
}

func (s *PeriodStore) GetByRange(ctx context.Context, budgetID finance.BudgetID, startDate, endDate time.Time) (*finance.BudgetPeriod, error) {
	var row periodDB
	query := `SELECT * FROM finance.budget_period WHERE budget_id = $1 AND start_date = $2 AND end_date = $3`
	if err := s.db.GetContext(ctx, &row, query, string(budgetID), startDate, endDate); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrPeriodNotFound
		}
		return nil, err
	}
	return &finance.BudgetPeriod{
		ID:                 finance.PeriodID(row.ID),
		BudgetID:           finance.BudgetID(row.BudgetID),
		SpaceID:            finance.SpaceID(row.SpaceID),
		StartDate:          row.StartDate,
		EndDate:            row.EndDate,
		LimitAmount:        row.LimitAmount,
		Currency:           finance.Currency(row.Currency),
		BaseCurrency:       finance.Currency(row.BaseCurrency),
		ExchangeRateToBase: row.ExchangeRateToBase,
		CreateTime:         nullTimeToTime(row.CreateTime),
		UpdateTime:         nullTimeToTime(row.UpdateTime),
	}, nil
}

func (s *PeriodStore) UpdateLimit(ctx context.Context, id finance.PeriodID, limit int64) error {
	query := `UPDATE finance.budget_period SET limit_amount = $1, update_time = NOW() WHERE id = $2`
	res, err := s.db.ExecContext(ctx, query, limit, string(id))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrPeriodNotFound
	}
	return nil
}

func (s *PeriodStore) ListByBudget(ctx context.Context, budgetID finance.BudgetID) ([]*finance.BudgetPeriod, error) {
	var rows []periodDB
	query := `SELECT * FROM finance.budget_period WHERE budget_id = $1 ORDER BY start_date DESC`
	if err := s.db.SelectContext(ctx, &rows, query, string(budgetID)); err != nil {
		return nil, err
	}

	periods := make([]*finance.BudgetPeriod, 0, len(rows))
	for i := range rows {
		periods = append(periods, &finance.BudgetPeriod{
			ID:                 finance.PeriodID(rows[i].ID),
			BudgetID:           finance.BudgetID(rows[i].BudgetID),
			SpaceID:            finance.SpaceID(rows[i].SpaceID),
			StartDate:          rows[i].StartDate,
			EndDate:            rows[i].EndDate,
			LimitAmount:        rows[i].LimitAmount,
			Currency:           finance.Currency(rows[i].Currency),
			BaseCurrency:       finance.Currency(rows[i].BaseCurrency),
			ExchangeRateToBase: rows[i].ExchangeRateToBase,
			CreateTime:         nullTimeToTime(rows[i].CreateTime),
			UpdateTime:         nullTimeToTime(rows[i].UpdateTime),
		})
	}
	return periods, nil
}

// --- ExchangeRate Store ---

type exchangeRateDB struct {
	SpaceID      string    `db:"space_id"`
	FromCurrency string    `db:"from_currency"`
	ToCurrency   string    `db:"to_currency"`
	Rate         float64   `db:"rate"`
	RateDate     time.Time `db:"rate_date"`
	CreateTime   time.Time `db:"create_time"`
}

type ExchangeRateStore struct {
	db *sqlx.DB
}

func NewExchangeRateStore(db *sqlx.DB) *ExchangeRateStore {
	return &ExchangeRateStore{db: db}
}

func (s *ExchangeRateStore) Create(ctx context.Context, r *finance.ExchangeRate) error {
	query := `INSERT INTO finance.exchange_rate (space_id, from_currency, to_currency, rate, rate_date, create_time)
		VALUES ($1, $2, $3, $4, $5, NOW())`
	_, err := s.db.ExecContext(ctx, query, string(r.SpaceID), r.FromCurrency, r.ToCurrency, r.Rate, r.RateDate)
	return err
}

func (s *ExchangeRateStore) GetRate(ctx context.Context, spaceID finance.SpaceID, fromCurrency, toCurrency finance.Currency, rateDate time.Time) (*finance.ExchangeRate, error) {
	var row exchangeRateDB
	// Lookup the rate on the closest date <= target date.
	query := `SELECT * FROM finance.exchange_rate 
		WHERE space_id = $1 AND from_currency = $2 AND to_currency = $3 AND rate_date <= $4 
		ORDER BY rate_date DESC LIMIT 1`
	if err := s.db.GetContext(ctx, &row, query, string(spaceID), string(fromCurrency), string(toCurrency), rateDate.Format("2006-01-02")); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrExchangeRateNotFound
		}
		return nil, err
	}
	return &finance.ExchangeRate{
		SpaceID:      finance.SpaceID(row.SpaceID),
		FromCurrency: finance.Currency(row.FromCurrency),
		ToCurrency:   finance.Currency(row.ToCurrency),
		Rate:         row.Rate,
		RateDate:     row.RateDate,
		CreateTime:   row.CreateTime,
	}, nil
}

func (s *ExchangeRateStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListExchangeRatesFilter) ([]*finance.ExchangeRate, string, error) {
	var rows []exchangeRateDB
	var err error

	limit := filter.PageSize
	if limit <= 0 {
		limit = 100
	}

	var query string
	var args []interface{}

	if filter.NextPageToken != "" {
		decoded, err := base64.URLEncoding.DecodeString(filter.NextPageToken)
		if err != nil {
			return nil, "", errors.New("invalid page token")
		}
		parts := strings.Split(string(decoded), ":")
		if len(parts) == 3 {
			query = `SELECT * FROM finance.exchange_rate 
				WHERE space_id = $1 AND (from_currency, to_currency, rate_date) > ($2, $3, $4)
				ORDER BY from_currency ASC, to_currency ASC, rate_date ASC
				LIMIT $5`
			args = []interface{}{string(spaceID), parts[0], parts[1], parts[2], limit + 1}
		} else {
			return nil, "", errors.New("invalid page token")
		}
	} else {
		query = `SELECT * FROM finance.exchange_rate 
			WHERE space_id = $1
			ORDER BY from_currency ASC, to_currency ASC, rate_date ASC
			LIMIT $2`
		args = []interface{}{string(spaceID), limit + 1}
	}

	if err = s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(rows) > int(limit)
	if hasMore {
		rows = rows[:limit]
	}

	rates := make([]*finance.ExchangeRate, 0, len(rows))
	for i := range rows {
		rates = append(rates, &finance.ExchangeRate{
			SpaceID:      finance.SpaceID(rows[i].SpaceID),
			FromCurrency: finance.Currency(rows[i].FromCurrency),
			ToCurrency:   finance.Currency(rows[i].ToCurrency),
			Rate:         rows[i].Rate,
			RateDate:     rows[i].RateDate,
			CreateTime:   rows[i].CreateTime,
		})
	}

	var nextToken string
	if hasMore && len(rows) > 0 {
		last := rows[len(rows)-1]
		tokenStr := fmt.Sprintf("%s:%s:%s", last.FromCurrency, last.ToCurrency, last.RateDate.Format("2006-01-02"))
		nextToken = base64.URLEncoding.EncodeToString([]byte(tokenStr))
	}

	return rates, nextToken, nil
}

func (s *ExchangeRateStore) Delete(ctx context.Context, spaceID finance.SpaceID, fromCurrency, toCurrency finance.Currency, rateDate time.Time) error {
	query := `DELETE FROM finance.exchange_rate WHERE space_id = $1 AND from_currency = $2 AND to_currency = $3 AND rate_date = $4`
	_, err := s.db.ExecContext(ctx, query, string(spaceID), string(fromCurrency), string(toCurrency), rateDate.Format("2006-01-02"))
	return err
}

// --- Transaction Store ---

type transactionDB struct {
	ID              string         `db:"id"`
	SpaceID         string         `db:"space_id"`
	Type            string         `db:"type"`
	BudgetID        sql.NullString `db:"budget_id"`
	PeriodID        sql.NullString `db:"period_id"`
	Amount          int64          `db:"amount"`
	Currency        string         `db:"currency"`
	AmountInBase    int64          `db:"amount_in_base"`
	Description     string         `db:"description"`
	TransactionDate sql.NullTime   `db:"transaction_date"`
	CreateTime      sql.NullTime   `db:"create_time"`
	UpdateTime      sql.NullTime   `db:"update_time"`
}

type TransactionStore struct {
	db *sqlx.DB
}

func NewTransactionStore(db *sqlx.DB) *TransactionStore {
	return &TransactionStore{db: db}
}

func (s *TransactionStore) Create(ctx context.Context, t *finance.Transaction) error {
	query := `INSERT INTO finance.transaction (id, space_id, type, budget_id, period_id, amount, currency, amount_in_base, description, transaction_date, create_time, update_time)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`

	var budgetID, periodID sql.NullString
	if t.BudgetID != nil {
		budgetID = sql.NullString{String: string(*t.BudgetID), Valid: true}
	}
	if t.PeriodID != nil {
		periodID = sql.NullString{String: string(*t.PeriodID), Valid: true}
	}

	_, err := s.db.ExecContext(ctx, query,
		string(t.ID), string(t.SpaceID), string(t.Type), budgetID, periodID,
		t.Amount, string(t.Currency), t.AmountInBase, t.Description,
		t.TransactionDate, t.CreateTime, t.UpdateTime,
	)
	return err
}

func (s *TransactionStore) GetByID(ctx context.Context, id finance.TransactionID) (*finance.Transaction, error) {
	var row transactionDB
	query := `SELECT * FROM finance.transaction WHERE id = $1`
	if err := s.db.GetContext(ctx, &row, query, string(id)); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, finance.ErrTransactionNotFound
		}
		return nil, err
	}

	var budgetIDPtr *finance.BudgetID
	if row.BudgetID.Valid {
		bID := finance.BudgetID(row.BudgetID.String)
		budgetIDPtr = &bID
	}
	var periodIDPtr *finance.PeriodID
	if row.PeriodID.Valid {
		pID := finance.PeriodID(row.PeriodID.String)
		periodIDPtr = &pID
	}

	return &finance.Transaction{
		ID:              finance.TransactionID(row.ID),
		SpaceID:         finance.SpaceID(row.SpaceID),
		Type:            finance.TransactionType(row.Type),
		BudgetID:        budgetIDPtr,
		PeriodID:        periodIDPtr,
		Amount:          row.Amount,
		Currency:        finance.Currency(row.Currency),
		AmountInBase:    row.AmountInBase,
		Description:     row.Description,
		TransactionDate: nullTimeToTime(row.TransactionDate),
		CreateTime:      nullTimeToTime(row.CreateTime),
		UpdateTime:      nullTimeToTime(row.UpdateTime),
	}, nil
}

func (s *TransactionStore) Delete(ctx context.Context, id finance.TransactionID) error {
	query := `DELETE FROM finance.transaction WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, string(id))
	if err != nil {
		return err
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrTransactionNotFound
	}
	return nil
}

func (s *TransactionStore) Update(ctx context.Context, t *finance.Transaction) error {
	query := `UPDATE finance.transaction SET 
		budget_id = $2, 
		period_id = $3, 
		amount = $4, 
		currency = $5, 
		amount_in_base = $6, 
		description = $7, 
		transaction_date = $8, 
		update_time = $9 
		WHERE id = $1`

	var budgetID, periodID sql.NullString
	if t.BudgetID != nil {
		budgetID = sql.NullString{String: string(*t.BudgetID), Valid: true}
	}
	if t.PeriodID != nil {
		periodID = sql.NullString{String: string(*t.PeriodID), Valid: true}
	}

	res, err := s.db.ExecContext(ctx, query,
		string(t.ID), budgetID, periodID,
		t.Amount, string(t.Currency), t.AmountInBase, t.Description,
		t.TransactionDate, t.UpdateTime,
	)
	if err != nil {
		return err
	}

	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return finance.ErrTransactionNotFound
	}
	return nil
}

func (s *TransactionStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListTransactionsFilter) ([]*finance.Transaction, string, error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	var cursorID string
	if filter.NextPageToken != "" {
		if decoded, err := base64.URLEncoding.DecodeString(filter.NextPageToken); err == nil {
			cursorID = string(decoded)
		}
	}

	conditions := []string{"space_id = $1"}
	args := []any{string(spaceID)}
	argIndex := 2

	if filter.BudgetID != nil {
		conditions = append(conditions, fmt.Sprintf("budget_id = $%d", argIndex))
		args = append(args, string(*filter.BudgetID))
		argIndex++
	}

	if filter.Type != nil {
		conditions = append(conditions, fmt.Sprintf("type = $%d", argIndex))
		args = append(args, string(*filter.Type))
		argIndex++
	}

	if cursorID != "" {
		conditions = append(conditions, fmt.Sprintf("id < $%d", argIndex))
		args = append(args, cursorID)
		argIndex++
	}

	query := fmt.Sprintf(`SELECT * FROM finance.transaction WHERE %s ORDER BY transaction_date DESC, id DESC LIMIT $%d`, strings.Join(conditions, " AND "), argIndex)
	args = append(args, filter.PageSize+1)

	var rows []transactionDB
	if err := s.db.SelectContext(ctx, &rows, query, args...); err != nil {
		return nil, "", err
	}

	hasMore := len(rows) > int(filter.PageSize)
	if hasMore {
		rows = rows[:filter.PageSize]
	}

	txns := make([]*finance.Transaction, 0, len(rows))
	for i := range rows {
		var budgetIDPtr *finance.BudgetID
		if rows[i].BudgetID.Valid {
			bID := finance.BudgetID(rows[i].BudgetID.String)
			budgetIDPtr = &bID
		}
		var periodIDPtr *finance.PeriodID
		if rows[i].PeriodID.Valid {
			pID := finance.PeriodID(rows[i].PeriodID.String)
			periodIDPtr = &pID
		}

		txns = append(txns, &finance.Transaction{
			ID:              finance.TransactionID(rows[i].ID),
			SpaceID:         finance.SpaceID(rows[i].SpaceID),
			Type:            finance.TransactionType(rows[i].Type),
			BudgetID:        budgetIDPtr,
			PeriodID:        periodIDPtr,
			Amount:          rows[i].Amount,
			Currency:        finance.Currency(rows[i].Currency),
			AmountInBase:    rows[i].AmountInBase,
			Description:     rows[i].Description,
			TransactionDate: nullTimeToTime(rows[i].TransactionDate),
			CreateTime:      nullTimeToTime(rows[i].CreateTime),
			UpdateTime:      nullTimeToTime(rows[i].UpdateTime),
		})
	}

	var nextToken string
	if hasMore && len(rows) > 0 {
		lastTxn := rows[len(rows)-1]
		nextToken = base64.URLEncoding.EncodeToString([]byte(lastTxn.ID))
	}

	return txns, nextToken, nil
}

func (s *TransactionStore) AggregateSpentInBase(ctx context.Context, periodID finance.PeriodID) (int64, error) {
	query := `SELECT COALESCE(SUM(amount_in_base), 0) FROM finance.transaction WHERE period_id = $1`
	var total int64
	err := s.db.GetContext(ctx, &total, query, string(periodID))
	return total, err
}
