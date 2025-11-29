// Package pagination provides features to support pagination.
package pagination

import "math"

const (
	DefaultPage     = 1
	DefaultPageSize = 20
	MaxPageSize     = 100
)

// Pagination represents a request for a specific slice of data.
// It is immutable and enforces safety limits (max page size).
type Pagination struct {
	page int
	size int
}

// New creates a valid Pagination object with safe defaults.
// Inputs:
//
//	page: 1-based index (e.g., 1 is the first page).
//	size: Number of items per page.
func New(page, size int) Pagination {
	// 1. Enforce Minimums (1-based pagination)
	if page < 1 {
		page = DefaultPage
	}
	if size < 1 {
		size = DefaultPageSize
	}

	// 2. Enforce Maximum (Database Safety)
	if size > MaxPageSize {
		size = MaxPageSize
	}

	return Pagination{
		page: page,
		size: size,
	}
}

// Page returns the requested page number (1-based).
func (p Pagination) Page() int {
	return p.page
}

// Size returns the limit (items per page).
func (p Pagination) Size() int {
	return p.size
}

// Offset calculates the number of items to skip.
func (p Pagination) Offset() int {
	return (p.page - 1) * p.size
}

type Page[T any] struct {
	items      []T
	pageNumber int // Current Page (e.g., 1)
	pageSize   int // Limit (e.g., 20)
	totalItems int // Count (e.g., 105)
}

func NewPage[T any](items []T, page, size, total int) Page[T] {
	if items == nil {
		items = make([]T, 0)
	}
	return Page[T]{
		items:      items,
		pageNumber: page,
		pageSize:   size,
		totalItems: total,
	}
}

func (p Page[T]) Items() []T {
	return p.items
}

func (p Page[T]) PageNumber() int {
	return p.pageNumber
}

func (p Page[T]) PageSize() int {
	return p.pageSize
}

func (p Page[T]) TotalItems() int {
	return p.totalItems
}

func (p Page[T]) TotalPages() int {
	if p.pageSize == 0 {
		return 0
	}
	// Ceiling division: (105 items / 20 size) = 5.25 -> 6 pages
	return int(math.Ceil(float64(p.totalItems) / float64(p.pageSize)))
}

func (p Page[T]) HasNext() bool {
	return p.pageNumber < p.TotalPages()
}

func (p Page[T]) HasPrevious() bool {
	return p.pageNumber > 1
}
