package paging

import (
	"encoding/base64"
	"encoding/json"
)

// Cursor represents the point in the dataset where the next page starts.
type Cursor struct {
	SortValue string `json:"v"` // The value of the sorting column (e.g. date string, number)
	ID        string `json:"i"` // The unique ID of the last record (to break ties)
}

// Encode converts the Cursor struct into a base64 string page token.
func (c Cursor) Encode() string {
	bytes, _ := json.Marshal(c)
	return base64.URLEncoding.EncodeToString(bytes)
}

// Decode extracts a Cursor from a base64 string page token.
func Decode(token string) (*Cursor, error) {
	if token == "" {
		return nil, nil
	}
	bytes, err := base64.URLEncoding.DecodeString(token)
	if err != nil {
		return nil, err
	}
	var c Cursor
	if err := json.Unmarshal(bytes, &c); err != nil {
		return nil, err
	}
	return &c, nil
}

// Page represents a paginated slice of items of type T.
type Page[T any] struct {
	Items         []T    `json:"items"`
	NextPageToken string `json:"next_page_token"`
	HasMore       bool   `json:"has_more"`
}

// NewPage constructs a Page[T] by checking if there is a next page,
// slicing the items to the page size, and encoding the next page token.
func NewPage[T any](
	items []T,
	pageSize int,
	extractCursor func(lastItem T) Cursor,
) *Page[T] {
	hasMore := len(items) > pageSize
	var nextToken string

	if len(items) > 0 {
		if hasMore {
			// Truncate to the requested size
			items = items[:pageSize]
			// Extract the cursor from the last item on the page (since there is a next page)
			lastItem := items[len(items)-1]
			cursor := extractCursor(lastItem)
			nextToken = cursor.Encode()
		}
	}

	// Make sure we return an empty slice instead of nil for Items if empty
	if items == nil {
		items = make([]T, 0)
	}

	return &Page[T]{
		Items:         items,
		NextPageToken: nextToken,
		HasMore:       hasMore,
	}
}
