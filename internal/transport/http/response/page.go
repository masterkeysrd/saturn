package response

import (
	"math"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/foundation/pagination"
)

// NewMeta creates a Meta object from a Domain Page.
// It encapsulates the calculation logic for derived fields like TotalPages.
func NewMeta[T any](page pagination.Page[T]) api.Meta {
	totalItems := page.TotalItems()
	size := page.PageSize()
	pageNumber := page.PageNumber()

	// Calculate total pages safely to avoid division by zero
	totalPages := 0
	if size > 0 {
		totalPages = int(math.Ceil(float64(totalItems) / float64(size)))
	}

	return api.Meta{
		Page:        pageNumber,
		Size:        size,
		TotalItems:  totalItems,
		TotalPages:  totalPages,
		HasNext:     pageNumber < totalPages,
		HasPrevious: pageNumber > 1,
	}
}
