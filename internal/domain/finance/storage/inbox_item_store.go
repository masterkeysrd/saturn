package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/doug-martin/goqu/v9"
	_ "github.com/doug-martin/goqu/v9/dialect/postgres"
	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/conv"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type inboxItemDB struct {
	ID                 string         `db:"id"`
	SpaceID            string         `db:"space_id"`
	IntegrationID      string         `db:"integration_id"`
	Status             string         `db:"status"`
	DocType            string         `db:"doc_type"`
	Amount             sql.NullInt64  `db:"amount"`
	Currency           sql.NullString `db:"currency"`
	VendorName         sql.NullString `db:"vendor_name"`
	TransactionDate    sql.NullTime   `db:"transaction_date"`
	AccountID          sql.NullString `db:"account_id"`
	BudgetID           sql.NullString `db:"budget_id"`
	ScheduledPaymentID sql.NullString `db:"scheduled_payment_id"`
	TransactionID      sql.NullString `db:"transaction_id"`
	BorrowingID        sql.NullString `db:"borrowing_id"`
	BorrowingLinkType  sql.NullString `db:"borrowing_link_type"`
	RawPayload         string         `db:"raw_payload"`
	MetadataJSON       string         `db:"metadata"`
	CreateTime         sql.NullTime   `db:"create_time"`
}

func toInboxItemDomain(db inboxItemDB) *finance.InboxItem {
	var accountID, budgetID, paymentID, transactionID, borrowingID *string
	var linkType *finance.BorrowingLinkType
	if db.AccountID.Valid {
		accountID = new(db.AccountID.String)
	}
	if db.BudgetID.Valid {
		budgetID = new(db.BudgetID.String)
	}
	if db.ScheduledPaymentID.Valid {
		paymentID = new(db.ScheduledPaymentID.String)
	}
	if db.TransactionID.Valid {
		transactionID = new(db.TransactionID.String)
	}
	if db.BorrowingID.Valid {
		borrowingID = new(db.BorrowingID.String)
	}
	if db.BorrowingLinkType.Valid {
		linkType = new(finance.BorrowingLinkType(db.BorrowingLinkType.String))
	}

	var amount int64
	if db.Amount.Valid {
		amount = db.Amount.Int64
	}

	var metadata map[string]any
	if db.MetadataJSON != "" {
		_ = json.Unmarshal([]byte(db.MetadataJSON), &metadata)
	}
	if metadata == nil {
		metadata = make(map[string]any)
	}

	return &finance.InboxItem{
		ID:                 db.ID,
		SpaceID:            db.SpaceID,
		IntegrationID:      db.IntegrationID,
		Status:             finance.InboxItemStatus(db.Status),
		DocType:            finance.InboxItemDocType(db.DocType),
		Amount:             amount,
		Currency:           db.Currency.String,
		VendorName:         db.VendorName.String,
		TransactionDate:    db.TransactionDate.Time,
		AccountID:          accountID,
		BudgetID:           budgetID,
		ScheduledPaymentID: paymentID,
		TransactionID:      transactionID,
		BorrowingID:        borrowingID,
		BorrowingLinkType:  linkType,
		RawPayload:         db.RawPayload,
		Metadata:           metadata,
		CreateTime:         db.CreateTime.Time,
	}
}

type InboxItemStore struct {
	db *sqlx.DB
}

func NewInboxItemStore(db *sqlx.DB) *InboxItemStore {
	return &InboxItemStore{db: db}
}

func (s *InboxItemStore) Insert(ctx context.Context, item *finance.InboxItem) error {
	createTime := item.CreateTime
	if createTime.IsZero() {
		createTime = time.Now().UTC()
	}

	var linkTypeStr *string
	if item.BorrowingLinkType != nil {
		s := string(*item.BorrowingLinkType)
		linkTypeStr = &s
	}

	metaJSON := "{}"
	if item.Metadata != nil {
		if b, err := json.Marshal(item.Metadata); err == nil {
			metaJSON = string(b)
		}
	}

	ds := pgDialect.Insert(goqu.S("finance").Table("inbox_item")).Rows(goqu.Record{
		"id":                   item.ID,
		"space_id":             item.SpaceID,
		"integration_id":       item.IntegrationID,
		"status":               string(item.Status),
		"doc_type":             string(item.DocType),
		"amount":               conv.Ptr(item.Amount),
		"currency":             conv.Ptr(item.Currency),
		"vendor_name":          conv.Ptr(item.VendorName),
		"transaction_date":     conv.Ptr(item.TransactionDate),
		"account_id":           conv.StringPtr(item.AccountID),
		"budget_id":            conv.StringPtr(item.BudgetID),
		"scheduled_payment_id": conv.StringPtr(item.ScheduledPaymentID),
		"transaction_id":       conv.StringPtr(item.TransactionID),
		"borrowing_id":         conv.StringPtr(item.BorrowingID),
		"borrowing_link_type":  conv.StringPtr(linkTypeStr),
		"raw_payload":          item.RawPayload,
		"metadata":             metaJSON,
		"create_time":          createTime,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	_, err = s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("insert inbox item: %w", err)
	}
	return nil
}

func (s *InboxItemStore) Get(ctx context.Context, spaceID finance.SpaceID, id string) (*finance.InboxItem, error) {
	ds := pgDialect.From(goqu.S("finance").Table("inbox_item")).Select("*").Where(goqu.Ex{
		"space_id": string(spaceID),
		"id":       id,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, err
	}
	var db inboxItemDB
	err = s.db.GetContext(ctx, &db, query, args...)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, fmt.Errorf("inbox item not found: %s", id)
		}
		return nil, fmt.Errorf("query inbox item: %w", err)
	}
	return toInboxItemDomain(db), nil
}

func (s *InboxItemStore) ListBySpace(ctx context.Context, spaceID finance.SpaceID, filter *finance.ListInboxItemsFilter) (*paging.Page[*finance.InboxItem], error) {
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	var ds *goqu.SelectDataset
	if filter.ExcludePayload {
		ds = pgDialect.From(goqu.S("finance").Table("inbox_item")).Select(
			"id", "space_id", "integration_id", "status", "doc_type",
			"amount", "currency", "vendor_name", "transaction_date",
			"account_id", "budget_id", "scheduled_payment_id", "transaction_id",
			"create_time",
		)
	} else {
		ds = pgDialect.From(goqu.S("finance").Table("inbox_item")).Select("*")
	}

	// Apply filtering conditions
	ds = ds.Where(goqu.Ex{"space_id": spaceID})

	if filter.Status != nil {
		ds = ds.Where(goqu.Ex{"status": string(*filter.Status)})
	}
	if filter.DocType != nil {
		ds = ds.Where(goqu.Ex{"doc_type": string(*filter.DocType)})
	}
	if filter.SearchQuery != nil && *filter.SearchQuery != "" {
		ds = ds.Where(goqu.Or(
			goqu.I("vendor_name").ILike("%"+*filter.SearchQuery+"%"),
			goqu.I("doc_type").ILike("%"+*filter.SearchQuery+"%"),
			goqu.I("raw_payload").ILike("%"+*filter.SearchQuery+"%"),
		))
	}

	// Keyset Cursor decoding
	cursor, _ := paging.Decode(filter.NextPageToken)

	// Validate sort field
	sortOrder := filter.Sort
	if !finance.IsInboxItemSortField(sortOrder.Field) {
		sortOrder.Field = finance.DefaultInboxItemSortField
		sortOrder.Ascending = false // Fallback to DESC for dates
	}

	// Apply sorting and keyset paging
	ds = paging.ApplyPagination(ds, paging.Options{
		Sort:     sortOrder,
		Cursor:   cursor,
		PageSize: uint(filter.PageSize),
	})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, fmt.Errorf("build sql query: %w", err)
	}

	var dbRows []inboxItemDB
	if err := s.db.SelectContext(ctx, &dbRows, query, args...); err != nil {
		return nil, fmt.Errorf("select context: %w", err)
	}

	items := make([]*finance.InboxItem, len(dbRows))
	for i := range dbRows {
		items[i] = toInboxItemDomain(dbRows[i])
	}

	page := paging.NewPage(items, int(filter.PageSize), func(i *finance.InboxItem) paging.Cursor {
		return paging.Cursor{
			SortValue: i.GetSortValue(sortOrder.Field),
			ID:        i.ID,
		}
	})

	return page, nil
}

func (s *InboxItemStore) Delete(ctx context.Context, spaceID finance.SpaceID, id string) error {
	ds := pgDialect.Delete(goqu.S("finance").Table("inbox_item")).Where(goqu.Ex{
		"space_id": string(spaceID),
		"id":       id,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("delete inbox item: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("inbox item not found: %s", id)
	}
	return nil
}

func (s *InboxItemStore) Update(ctx context.Context, item *finance.InboxItem) error {
	var linkTypeStr *string
	if item.BorrowingLinkType != nil {
		str := string(*item.BorrowingLinkType)
		linkTypeStr = &str
	}

	metaJSON := "{}"
	if item.Metadata != nil {
		if b, err := json.Marshal(item.Metadata); err == nil {
			metaJSON = string(b)
		}
	}

	ds := pgDialect.Update(goqu.S("finance").Table("inbox_item")).
		Set(goqu.Record{
			"status":               string(item.Status),
			"doc_type":             string(item.DocType),
			"amount":               conv.Ptr(item.Amount),
			"currency":             conv.Ptr(item.Currency),
			"vendor_name":          conv.Ptr(item.VendorName),
			"transaction_date":     conv.Ptr(item.TransactionDate),
			"account_id":           conv.StringPtr(item.AccountID),
			"budget_id":            conv.StringPtr(item.BudgetID),
			"scheduled_payment_id": conv.StringPtr(item.ScheduledPaymentID),
			"transaction_id":       conv.StringPtr(item.TransactionID),
			"borrowing_id":         conv.StringPtr(item.BorrowingID),
			"borrowing_link_type":  conv.StringPtr(linkTypeStr),
			"raw_payload":          item.RawPayload,
			"metadata":             metaJSON,
		}).
		Where(goqu.Ex{
			"space_id": item.SpaceID,
			"id":       item.ID,
		})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return err
	}
	res, err := s.db.ExecContext(ctx, query, args...)
	if err != nil {
		return fmt.Errorf("update inbox item: %w", err)
	}
	rows, err := res.RowsAffected()
	if err != nil {
		return err
	}
	if rows == 0 {
		return fmt.Errorf("inbox item not found for update: %s", item.ID)
	}
	return nil
}
