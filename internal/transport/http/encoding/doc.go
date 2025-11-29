// Package encoding provides HTTP request parameter decoding and validation utilities
// for the transport layer.
//
// This package contains reusable functions and types for extracting and validating
// data from HTTP requests, including query parameters, path parameters, and headers.
// It serves as a bridge between raw HTTP requests and structured DTOs used by handlers.
//
// # Core Responsibilities
//
//   - Decode query parameters into strongly-typed values
//   - Validate request parameters according to business rules
//   - Provide consistent error messages for invalid input
//   - Convert HTTP-level types to transport DTOs
//
// # Design Principles
//
//   - Single Source of Truth: Common validation rules (pagination limits, date formats)
//     are defined once and reused across all endpoints
//   - Type Safety: Use specific types (PaginationRequest, DateRangeRequest) rather than
//     primitive values to prevent errors
//   - Clear Separation: This package handles HTTP concerns only; it does not contain
//     domain logic or interact with foundation types directly
//   - Explicit Conversion: DTOs provide ToPagination(), ToDateRange() methods to convert
//     to foundation types, keeping the conversion explicit and testable
//
// # Usage Pattern
//
// The typical flow for using this package:
//
//  1. Input transformer extracts parameters from *http.Request
//  2. Decoder functions validate and populate request DTOs
//  3. Handler receives validated DTOs
//  4. Handler converts DTOs to domain types using To*() methods
//
// Example:
//
//	func transformListBudgetsInput(ctx context.Context, req *http.Request) (*api.ListBudgetsRequest, error) {
//		var p encoding.PaginationRequest
//		if err := encoding.DecodePagination(req, &p); err != nil {
//			return nil, err
//		}
//
//		return &api.ListBudgetsRequest{
//			Text:       encoding.GetStringQuery(req, "text", ""),
//			Pagination: p,
//		}, nil
//	}
//
//	func (c *Controller) ListBudgets(ctx context.Context, req *api.ListBudgetsRequest) (*api.ListBudgetsResponse, error) {
//		criteria := &finance.BudgetSearchCriteria{
//			Text:       req.Text,
//			Pagination: req.Pagination. ToPagination(), // Convert to foundation type
//		}
//		// ... execute domain logic
//	}
//
// # Request Types
//
// This package defines structured types for common request parameter groups:
//
//   - PaginationRequest: Page and size parameters with validation (min/max limits)
//   - DateRangeRequest: Start and end date parameters with format validation
//   - Additional request types can be added following the same pattern
//
// Each request type provides:
//   - A Decode* function to extract and validate from *http.Request
//   - A To*() method to convert to the corresponding foundation type
//   - Field validation with descriptive error messages
//
// # Query Parameter Extraction
//
// Helper functions for extracting typed values from query strings:
//
//   - GetStringQuery: Extract string with default value
//   - GetIntQuery: Extract and parse integer with validation
//   - GetStringSliceQuery: Extract comma-separated list
//   - GetBoolQuery: Extract and parse boolean
//
// These functions handle missing values gracefully and return clear error messages
// for invalid input.
//
// # Validation
//
// Validation rules are enforced at decode time:
//
//   - Pagination: Page >= 1, Size between 1 and 100
//   - Date ranges: Valid ISO 8601 format, start_date <= end_date
//   - Custom validation can be added to decoder functions
//
// Invalid input results in descriptive errors that can be returned directly
// to the client as 400 Bad Request responses.
//
// # Extensibility
//
// To add support for new parameter types:
//
//  1. Define a request struct (e.g., SortRequest)
//  2. Implement a Decode* function with validation
//  3. Add a To*() method to convert to the foundation type
//  4. Add helper functions if needed (e.g., GetSortFieldQuery)
//
// Example:
//
//	type SortRequest struct {
//		Field string
//		Order string
//	}
//
//	func DecodeSort(r *http.Request, s *SortRequest) error {
//		s.Field = GetStringQuery(r, "sort_by", "created_at")
//		s. Order = GetStringQuery(r, "order", "desc")
//
//		if s.Order != "asc" && s.Order != "desc" {
//			return fmt.Errorf("order must be 'asc' or 'desc'")
//		}
//
//		return nil
//	}
//
//	func (s SortRequest) ToSort() sort.Sort {
//		return sort.New(s.Field, s.Order)
//	}
package encoding
