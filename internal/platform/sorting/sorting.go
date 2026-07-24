package sorting

import "strings"

// SortOrder encapsulates sorting parameters for database queries.
type SortOrder struct {
	Field     string // The field name to sort by (e.g. "transaction_date")
	Ascending bool   // true for ASC, false for DESC
}

// New creates a new SortOrder instance.
func New(field string, ascending bool) SortOrder {
	return SortOrder{
		Field:     field,
		Ascending: ascending,
	}
}

// Parse extracts a SortOrder from a string parameter (e.g. "field" or "field:desc").
func Parse(sortStr string) SortOrder {
	if sortStr == "" {
		return SortOrder{Ascending: true}
	}

	parts := strings.Split(sortStr, ":")
	field := parts[0]
	ascending := true

	if len(parts) > 1 && strings.ToLower(parts[1]) == "desc" {
		ascending = false
	}

	return SortOrder{
		Field:     field,
		Ascending: ascending,
	}
}
