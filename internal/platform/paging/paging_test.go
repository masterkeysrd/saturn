package paging

import (
	"testing"

	"github.com/doug-martin/goqu/v9"
	_ "github.com/doug-martin/goqu/v9/dialect/postgres"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

func TestCursorRoundtrip(t *testing.T) {
	c := Cursor{
		SortValue: "2026-07-24T12:00:00Z",
		ID:        "txn_12345",
	}

	token := c.Encode()
	if token == "" {
		t.Fatal("expected encoded token to not be empty")
	}

	decoded, err := Decode(token)
	if err != nil {
		t.Fatalf("unexpected error decoding token: %v", err)
	}

	if decoded.SortValue != c.SortValue {
		t.Errorf("expected SortValue %q, got %q", c.SortValue, decoded.SortValue)
	}
	if decoded.ID != c.ID {
		t.Errorf("expected ID %q, got %q", c.ID, decoded.ID)
	}
}

func TestDecodeEmptyToken(t *testing.T) {
	decoded, err := Decode("")
	if err != nil {
		t.Fatalf("unexpected error decoding empty token: %v", err)
	}
	if decoded != nil {
		t.Error("expected decoded cursor to be nil for empty token")
	}
}

type testItem struct {
	ID    string
	Value string
}

func TestNewPage(t *testing.T) {
	items := []testItem{
		{ID: "1", Value: "A"},
		{ID: "2", Value: "B"},
		{ID: "3", Value: "C"},
	}

	pageSize := 2

	page := NewPage(items, pageSize, func(item testItem) Cursor {
		return Cursor{SortValue: item.Value, ID: item.ID}
	})

	if len(page.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(page.Items))
	}
	if page.Items[0].ID != "1" || page.Items[1].ID != "2" {
		t.Errorf("unexpected items on page: %v", page.Items)
	}

	if !page.HasMore {
		t.Error("expected HasMore to be true")
	}

	if page.NextPageToken == "" {
		t.Fatal("expected NextPageToken to be generated")
	}

	decodedCursor, err := Decode(page.NextPageToken)
	if err != nil {
		t.Fatalf("failed to decode generated page token: %v", err)
	}

	if decodedCursor.ID != "2" || decodedCursor.SortValue != "B" {
		t.Errorf("expected token to encode last page item (ID=2, Value=B), got: %+v", decodedCursor)
	}
}

func TestNewPageNoMore(t *testing.T) {
	items := []testItem{
		{ID: "1", Value: "A"},
		{ID: "2", Value: "B"},
	}

	pageSize := 2

	page := NewPage(items, pageSize, func(item testItem) Cursor {
		return Cursor{SortValue: item.Value, ID: item.ID}
	})

	if len(page.Items) != 2 {
		t.Fatalf("expected 2 items, got %d", len(page.Items))
	}
	if page.HasMore {
		t.Error("expected HasMore to be false")
	}
	if page.NextPageToken != "" {
		t.Errorf("expected empty page token, got %q", page.NextPageToken)
	}
}

func TestApplyPaginationGoqu(t *testing.T) {
	dialect := goqu.Dialect("postgres")
	query := dialect.From("transactions")

	sort := sorting.New("created_at", false) // DESC
	cursor := &Cursor{SortValue: "2026-07-24T12:00:00Z", ID: "txn_5"}
	pageSize := uint(10)

	paginatedQuery := ApplyPagination(query, Options{
		Sort:     sort,
		Cursor:   cursor,
		PageSize: pageSize,
	})

	sql, args, err := paginatedQuery.Prepared(true).ToSQL()
	if err != nil {
		t.Fatalf("unexpected query building error: %v", err)
	}

	expectedSQL := `SELECT * FROM "transactions" WHERE (("created_at" < $1) OR (("created_at" = $2) AND ("id" < $3))) ORDER BY "created_at" DESC, "id" DESC LIMIT $4`
	if sql != expectedSQL {
		t.Errorf("expected SQL:\n%s\ngot:\n%s", expectedSQL, sql)
	}

	if len(args) != 4 {
		t.Fatalf("expected 4 arguments, got %d: %v", len(args), args)
	}

	if args[0] != "2026-07-24T12:00:00Z" || args[1] != "2026-07-24T12:00:00Z" || args[2] != "txn_5" || args[3] != int64(11) {
		t.Errorf("unexpected arguments: %v", args)
	}
}
