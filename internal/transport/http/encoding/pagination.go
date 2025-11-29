package encoding

import (
	"fmt"
	"net/http"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/foundation/pagination"
)

// DecodePagination extracts and validates pagination from query parameters
func DecodePagination(r *http.Request, p *api.PaginationRequest) error {
	page, err := GetIntQuery(r, "page", pagination.DefaultPage)
	if err != nil {
		return fmt.Errorf("invalid page parameter: %w", err)
	}

	size, err := GetIntQuery(r, "size", pagination.DefaultPageSize)
	if err != nil {
		return fmt.Errorf("invalid size parameter: %w", err)
	}

	p.Page = page
	p.Size = size
	return nil
}
