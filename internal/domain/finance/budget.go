package finance

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/foundation/access"
	"github.com/masterkeysrd/saturn/internal/foundation/appearance"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
	"github.com/masterkeysrd/saturn/internal/foundation/pagination"
	"github.com/masterkeysrd/saturn/internal/foundation/space"
	"github.com/masterkeysrd/saturn/internal/pkg/money"
	"github.com/masterkeysrd/saturn/internal/pkg/round"
	"github.com/masterkeysrd/saturn/internal/pkg/timeutils"
)

// BudgetKey represents the unique key for a Budget aggregate within a specific space.
type BudgetKey struct {
	ID      BudgetID
	SpaceID space.ID
}

// BudgetID represents the unique identifier for a Budget aggregate.
type BudgetID string

// String returns the string representation of the BudgetID.
func (id BudgetID) String() string {
	return string(id)
}

// BudgetPeriodID represents the unique identifier for a BudgetPeriod entity.
type BudgetPeriodID string

// String returns the string representation of the BudgetPeriodID.
func (i BudgetPeriodID) String() string {
	return string(i)
}

// BudgetStore defines the contract for persisting and retrieving Budget aggregate roots.
// This interface is required by the Domain Service layer.
type BudgetStore interface {
	Get(context.Context, BudgetKey) (*Budget, error)
	List(context.Context, space.ID) ([]*Budget, error)
	Store(context.Context, *Budget) error
	Delete(context.Context, BudgetKey) error
}

type BudgetSearcher interface {
	Search(context.Context, *BudgetSearchCriteria) (BudgetPage, error)
}

// BudgetPage represet a page of Budget Items.
type BudgetPage = pagination.Page[*BudgetItem]

// BudgetPeriodStore defines the contract for managing BudgetPeriod entities.
type BudgetPeriodStore interface {
	GetByDate(context.Context, BudgetID, time.Time) (*BudgetPeriod, error)
	Store(context.Context, *BudgetPeriod) error
	DeleteBy(context.Context, BudgetPeriodCriteria) (int, error)
}

// BudgetPeriodCriteria is the interface that defines a valid criteria for querying BudgetPeriod entities.
// It uses an unexported method to limit implementation to the finance package.
type BudgetPeriodCriteria interface {
	isBudgetPeriodCriteria()
}

// BudgetUpdateSchema defines the allowed fields for partial updates via the field mask.
// Fields not defined here cannot be updated by the client.
var BudgetUpdateSchema = fieldmask.NewSchema("budget").
	Field("name",
		fieldmask.WithDescription("Budget name"),
		fieldmask.WithRequired(),
	).
	Field("color",
		fieldmask.WithDescription("Budget color"),
		fieldmask.WithRequired(),
	).
	Field("icon_name",
		fieldmask.WithDescription("Budget icon name"),
		fieldmask.WithRequired(),
	).
	Field("amount",
		fieldmask.WithDescription("Budget amount in cents"),
		fieldmask.WithRequired(),
	).
	Build()

// Budget is the Aggregate Root representing a financial limit and category.
type Budget struct {
	BudgetKey

	Name        string
	Description *string
	Status      BudgetStatus

	appearance.Appearance

	Amount     money.Money
	CreateTime time.Time
	CreateBy   auth.UserID
	UpdateTime time.Time
	UpdateBy   auth.UserID
}

// Initialize sets the primary key (ID) and the initial creation timestamp for a
// new Budget.
func (b *Budget) Initialize(actor access.Principal) error {
	if b == nil {
		return errors.New("cannot initialize nil budget")
	}

	id, err := id.New[BudgetID]()
	if err != nil {
		return fmt.Errorf("cannot created a budget identifier: %w", err)
	}

	now := time.Now().UTC()
	b.ID = id
	b.SpaceID = actor.SpaceID()
	b.CreateTime = now
	b.CreateBy = actor.ActorID()
	b.UpdateTime = now
	b.UpdateBy = actor.ActorID()
	return nil
}

// Validate checks the core invariants of the Budget entity (e.g., presence of ID,
// positive amount).
func (b *Budget) Validate() error {
	if b == nil {
		return errors.New("budget is nil")
	}

	if b.ID == "" {
		return errors.New("id field is required")
	}

	if b.SpaceID == "" {
		return errors.New("space_id field is required")
	}

	if err := id.Validate(b.ID); err != nil {
		return fmt.Errorf("id field is invalid: %w", err)
	}

	if b.Name == "" {
		return errors.New("name field is required")
	}

	if len(b.Name) > 32 {
		return errors.New("name field exceeds 32 characters")
	}

	if err := b.Appearance.Validate(); err != nil {
		return fmt.Errorf("invalid appearance: %w", err)
	}

	if b.Amount.Cents <= 0 {
		return errors.New("amount field must be a positive number")
	}

	if err := b.Amount.Validate(); err != nil {
		return fmt.Errorf("invalid amount: %w", err)
	}
	return nil
}

// Update applies partial changes from the 'update' source based on the field mask.
// It enforces the immutability of the currency field.
func (b *Budget) Update(update *Budget, fields *fieldmask.FieldMask) error {
	if b == nil {
		return errors.New("cannot update nil budget")
	}

	if update == nil {
		return errors.New("update source is nil")
	}

	if err := BudgetUpdateSchema.Validate(fields); err != nil {
		return err
	}

	if fields.Contains("name") {
		b.Name = update.Name
	}

	if fields.Contains("icon_name") {
		b.Icon = update.Icon
	}

	if fields.Contains("color") {
		b.Color = update.Color
	}

	if fields.Contains("amount") {
		// Invariant: Currency must not change after creation.
		if b.Amount.Currency != update.Amount.Currency {
			return fmt.Errorf("budget currency cannot be changed: %s vs %s", b.Amount.Currency, update.Amount.Currency)
		}

		b.Amount = update.Amount
	}

	b.UpdateTime = time.Now().UTC()
	return nil
}

type BudgetStatus string

const (
	BudgetStatusActive BudgetStatus = "active"
	BudgetStatusPaused BudgetStatus = "paused"
)

func (bs BudgetStatus) IsValid() bool {
	switch bs {
	case BudgetStatusActive, BudgetStatusPaused:
		return true
	default:
		return false
	}
}

func (bs BudgetStatus) String() string {
	return string(bs)
}

// CreatePeriod creates a new BudgetPeriod for the provided time 't' and exchange context 'c'.
// This logic belongs to the Aggregate Root as it ensures the new period is created correctly.
func (b *Budget) CreatePeriod(c *Currency, t time.Time) (*BudgetPeriod, error) {
	id, err := id.New[BudgetPeriodID]()
	if err != nil {
		return nil, fmt.Errorf("cannot create period identifier: %w", err)
	}

	start, end := timeutils.MonthStartEnd(t)
	p := BudgetPeriod{
		ID:           id,
		BudgetID:     b.ID,
		StartDate:    start,
		EndDate:      end,
		Amount:       b.Amount,
		BaseAmount:   b.Amount.Exchange(DefaultBaseCurrency, c.Rate),
		ExchangeRate: c.Rate,
		CreatedAt:    time.Now().UTC(),
	}

	return &p, nil
}

// SyncPeriod updates a calculated BudgetPeriod object (or Value Object)
// based on the master Budget's current state. This is required for maintaining
// currency conversion consistency across the aggregate.
func (b *Budget) SyncPeriod(period *BudgetPeriod, currency *Currency) error {
	if b == nil {
		return errors.New("cannot sync period on nil budget")
	}

	if period == nil {
		return errors.New("budget period is nil")
	}

	if currency == nil {
		return errors.New("currency is nil")
	}

	// Invariant: Ensure the dependent period belongs to this root.
	if b.ID != period.BudgetID {
		return errors.New("cannot sync period: ID mismatch with root budget")
	}

	// Invariant: Ensure the conversion context is compatible with the budget's
	// currency.
	if b.Amount.Currency != currency.Code {
		return fmt.Errorf("budget currency (%s) cannot be synced with external currency (%s)", b.Amount.Currency, currency.Code)
	}

	// Recalculate base currency value and stamp the period.
	period.BaseAmount = b.Amount.Exchange(DefaultBaseCurrency, currency.Rate)
	period.ExchangeRate = currency.Rate
	period.UpdatedAt = time.Now().UTC()
	return nil
}

// sanitize performs structural cleanup (e.g., trimming whitespace) on the Budget fields.
func (b *Budget) sanitize() {
	if b == nil {
		return
	}
	b.Name = strings.TrimSpace(b.Name)
}

// BudgetPeriod is a Dependent Entity within the Budget Aggregate.
// It represents a specific time slice of the budget, capturing immutable details
// like the exchange rate and calculated base currency amount at that time.
type BudgetPeriod struct {
	ID           BudgetPeriodID
	BudgetID     BudgetID
	StartDate    time.Time
	EndDate      time.Time
	Amount       money.Money
	BaseAmount   money.Money
	ExchangeRate float64
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// Validate checks whether the BudgetPeriod fields are valid and adhere to internal invariants.
func (bp *BudgetPeriod) Validate() error {
	if bp == nil {
		return fmt.Errorf("budget period is nil")
	}
	if bp.ID == "" {
		return fmt.Errorf("budget period ID is empty")
	}
	if bp.BudgetID == "" {
		return fmt.Errorf("budget ID is empty")
	}
	if bp.StartDate.IsZero() {
		return fmt.Errorf("start date is not set")
	}
	if bp.EndDate.IsZero() {
		return fmt.Errorf("end date is not set")
	}
	if bp.EndDate.Before(bp.StartDate) {
		return fmt.Errorf("end date %v is before start date %v", bp.EndDate, bp.StartDate)
	}
	if bp.Amount.Cents < 0 {
		return fmt.Errorf("amount cents cannot be negative")
	}
	if bp.Amount.Currency == "" {
		return fmt.Errorf("amount currency is empty")
	}
	if bp.BaseAmount.Cents < 0 {
		return fmt.Errorf("base amount cents cannot be negative")
	}
	if bp.BaseAmount.Currency == "" {
		return fmt.Errorf("base amount currency is empty")
	}
	if bp.ExchangeRate <= 0 {
		return fmt.Errorf("exchange rate must be positive")
	}
	if bp.CreatedAt.IsZero() {
		return fmt.Errorf("created at is not set")
	}
	// UpdatedAt may be zero for new objects. Add check if you require it.
	return nil
}

type BudgetItem struct {
	ID   BudgetID
	Name string
	appearance.Appearance

	Amount           money.Money
	BaseAmount       money.Money
	Spent            money.Money
	BaseSpent        money.Money
	PeriodStartDate  time.Time
	PeriodEndDate    time.Time
	TransactionCount int
}

func (b *BudgetItem) Usage() float64 {
	if b.Amount.Cents == 0 {
		return 0
	}
	ussage := (float64(b.Spent.Cents) / float64(b.Amount.Cents)) * 100
	return round.Round(ussage, 2)
}

// UpdateBudgetInput encapsulates the data and metadata required to update a Budget.
type UpdateBudgetInput struct {
	ID         BudgetID
	Budget     *Budget
	UpdateMask *fieldmask.FieldMask
}

type BudgetSearchInput struct {
	pagination.Pagination
	Term string
}

func (bsi *BudgetSearchInput) toCriteria() BudgetSearchCriteria {
	if bsi == nil {
		return BudgetSearchCriteria{}
	}

	return BudgetSearchCriteria{
		Term:       bsi.Term,
		Pagination: bsi.Pagination,
	}
}

type BudgetSearchCriteria struct {
	pagination.Pagination
	Term string
	Date time.Time
}

func (bsc *BudgetSearchCriteria) sanitize() {
	if bsc == nil {
		return
	}

	bsc.Term = strings.TrimSpace(bsc.Term)
}

func (bsc *BudgetSearchCriteria) Validate() error {
	if bsc == nil {
		return errors.New("budget search criteria is nil")
	}

	if len(bsc.Term) > 1 && len(bsc.Term) < 3 {
		return errors.New("term to search cannot be less than 3 characters")
	}

	if len(bsc.Term) > 20 {
		return errors.New("term to search cannot exceeds 20 characters")
	}

	return nil
}
