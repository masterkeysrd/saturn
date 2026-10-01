package storage

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"

	"github.com/doug-martin/goqu/v9"
	_ "github.com/doug-martin/goqu/v9/dialect/postgres"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/platform/conv"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/paging"
)

type InboxItemRecord struct {
	ID                     string         `db:"id"`
	SpaceID                string         `db:"space_id"`
	IntegrationID          string         `db:"integration_id"`
	Status                 string         `db:"status"`
	DocType                string         `db:"doc_type"`
	Amount                 sql.NullInt64  `db:"amount"`
	Currency               sql.NullString `db:"currency"`
	VendorName             sql.NullString `db:"vendor_name"`
	TransactionDate        sql.NullTime   `db:"transaction_date"`
	AccountID              sql.NullString `db:"account_id"`
	BudgetID               sql.NullString `db:"budget_id"`
	ScheduledTransactionID sql.NullString `db:"scheduled_transaction_id"`
	TransactionID          sql.NullString `db:"transaction_id"`
	BorrowingID            sql.NullString `db:"borrowing_id"`
	BorrowingLinkType      sql.NullString `db:"borrowing_link_type"`
	RawPayload             string         `db:"raw_payload"`
	MetadataJSON           string         `db:"metadata"`
	CreateTime             sql.NullTime   `db:"create_time"`
}

// func toInboxItemDomain(db InboxItemRecord) *finance.InboxItem {
func (ibi InboxItemRecord) toInboxItemDomain() *finance.InboxItem {
	var accountID, budgetID, paymentID, transactionID, borrowingID *string
	var linkType *finance.BorrowingLinkType
	if ibi.AccountID.Valid {
		accountID = new(ibi.AccountID.String)
	}
	if ibi.BudgetID.Valid {
		budgetID = new(ibi.BudgetID.String)
	}
	if ibi.ScheduledTransactionID.Valid {
		paymentID = new(ibi.ScheduledTransactionID.String)
	}
	if ibi.TransactionID.Valid {
		transactionID = new(ibi.TransactionID.String)
	}
	if ibi.BorrowingID.Valid {
		borrowingID = new(ibi.BorrowingID.String)
	}
	if ibi.BorrowingLinkType.Valid {
		linkType = new(finance.BorrowingLinkType(ibi.BorrowingLinkType.String))
	}

	var amount int64
	if ibi.Amount.Valid {
		amount = ibi.Amount.Int64
	}

	var metadata map[string]any
	if ibi.MetadataJSON != "" {
		_ = json.Unmarshal([]byte(ibi.MetadataJSON), &metadata)
	}
	if metadata == nil {
		metadata = make(map[string]any)
	}

	return &finance.InboxItem{
		ID:                     ibi.ID,
		IntegrationID:          ibi.IntegrationID,
		Status:                 finance.InboxItemStatus(ibi.Status),
		DocType:                finance.InboxItemDocType(ibi.DocType),
		Amount:                 amount,
		Currency:               ibi.Currency.String,
		VendorName:             ibi.VendorName.String,
		TransactionDate:        ibi.TransactionDate.Time,
		AccountID:              accountID,
		BudgetID:               budgetID,
		ScheduledTransactionID: paymentID,
		TransactionID:          transactionID,
		BorrowingID:            borrowingID,
		BorrowingLinkType:      linkType,
		RawPayload:             ibi.RawPayload,
		Metadata:               metadata,
		CreateTime:             ibi.CreateTime.Time,
	}
}

type InboxItemStore struct {
	db db.DB
}

func NewInboxItemStore(database db.DB) *InboxItemStore {
	return &InboxItemStore{db: database}
}

func (s *InboxItemStore) Insert(ctx context.Context, rCtx finance.Context, item *finance.InboxItem) error {
	const op errors.Op = "domain/finance/storage.InsertInboxItem"
	createTime := item.CreateTime
	if createTime.IsZero() {
		createTime = time.Now().UTC()
	}

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

	ds := pgDialect.Insert(goqu.S("finance").Table("inbox_item")).Rows(goqu.Record{
		"id":                       item.ID,
		"space_id":                 string(rCtx.SpaceID()),
		"integration_id":           item.IntegrationID,
		"status":                   string(item.Status),
		"doc_type":                 string(item.DocType),
		"amount":                   conv.Ptr(item.Amount),
		"currency":                 conv.Ptr(item.Currency),
		"vendor_name":              conv.Ptr(item.VendorName),
		"transaction_date":         conv.Ptr(item.TransactionDate),
		"account_id":               conv.StringPtr(item.AccountID),
		"budget_id":                conv.StringPtr(item.BudgetID),
		"scheduled_transaction_id": conv.StringPtr(item.ScheduledTransactionID),
		"transaction_id":           conv.StringPtr(item.TransactionID),
		"borrowing_id":             conv.StringPtr(item.BorrowingID),
		"borrowing_link_type":      conv.StringPtr(linkTypeStr),
		"raw_payload":              item.RawPayload,
		"metadata":                 metaJSON,
		"create_time":              createTime,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if _, err := s.db.Exec(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (s *InboxItemStore) Get(ctx context.Context, rCtx finance.Context, id string) (*finance.InboxItem, error) {
	const op errors.Op = "domain/finance/storage.GetInboxItem"
	ds := pgDialect.From(goqu.S("finance").Table("inbox_item")).Select("*").Where(goqu.Ex{
		"space_id": string(rCtx.SpaceID()),
		"id":       id,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}
	var db InboxItemRecord
	if err := s.db.Get(ctx, &db, query, args...); err != nil {
		return nil, errors.E(op, err)
	}
	return db.toInboxItemDomain(), nil
}

func (s *InboxItemStore) ListBySpace(ctx context.Context, rCtx finance.Context, filter *finance.ListInboxItemsFilter) (*paging.Page[*finance.InboxItem], error) {
	const op errors.Op = "domain/finance/storage.ListInboxItems"
	if filter.PageSize <= 0 || filter.PageSize > 100 {
		filter.PageSize = 20
	}

	var ds *goqu.SelectDataset
	if filter.ExcludePayload {
		ds = pgDialect.From(goqu.S("finance").Table("inbox_item")).Select(
			"id", "space_id", "integration_id", "status", "doc_type",
			"amount", "currency", "vendor_name", "transaction_date",
			"account_id", "budget_id", "scheduled_transaction_id", "transaction_id",
			"create_time",
		)
	} else {
		ds = pgDialect.From(goqu.S("finance").Table("inbox_item")).Select("*")
	}

	// Apply filtering conditions
	ds = ds.Where(goqu.Ex{"space_id": string(rCtx.SpaceID())})

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
		return nil, errors.E(op, err)
	}

	var dbRows []InboxItemRecord
	if err := s.db.Select(ctx, &dbRows, query, args...); err != nil {
		return nil, errors.E(op, err)
	}

	items := make([]*finance.InboxItem, len(dbRows))
	for i := range dbRows {
		items[i] = dbRows[i].toInboxItemDomain()
	}

	page := paging.NewPage(items, int(filter.PageSize), func(i *finance.InboxItem) paging.Cursor {
		return paging.Cursor{
			SortValue: i.GetSortValue(sortOrder.Field),
			ID:        i.ID,
		}
	})

	return page, nil
}

func (s *InboxItemStore) Delete(ctx context.Context, rCtx finance.Context, id string) error {
	const op errors.Op = "domain/finance/storage.DeleteInboxItem"
	ds := pgDialect.Delete(goqu.S("finance").Table("inbox_item")).Where(goqu.Ex{
		"space_id": string(rCtx.SpaceID()),
		"id":       id,
	})
	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

func (s *InboxItemStore) Update(ctx context.Context, rCtx finance.Context, item *finance.InboxItem) error {
	const op errors.Op = "domain/finance/storage.UpdateInboxItem"
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
			"status":                   string(item.Status),
			"doc_type":                 string(item.DocType),
			"amount":                   conv.Ptr(item.Amount),
			"currency":                 conv.Ptr(item.Currency),
			"vendor_name":              conv.Ptr(item.VendorName),
			"transaction_date":         conv.Ptr(item.TransactionDate),
			"account_id":               conv.StringPtr(item.AccountID),
			"budget_id":                conv.StringPtr(item.BudgetID),
			"scheduled_transaction_id": conv.StringPtr(item.ScheduledTransactionID),
			"transaction_id":           conv.StringPtr(item.TransactionID),
			"borrowing_id":             conv.StringPtr(item.BorrowingID),
			"borrowing_link_type":      conv.StringPtr(linkTypeStr),
			"raw_payload":              item.RawPayload,
			"metadata":                 metaJSON,
		}).
		Where(goqu.Ex{
			"space_id": string(rCtx.SpaceID()),
			"id":       item.ID,
		})

	query, args, err := ds.Prepared(true).ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, query, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}
