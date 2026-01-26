// Package paging provides features to support pagination.
package paging

const (
	DefaultPage = 1
	MaxPageSize = 100
)

// Source defines an interface for pagination sources.
type Source interface {
	GetSize() int32
	GetPage() int32
}

type Request struct {
	Page int
	Size int
}

func NewRequest(page, size int) Request {
	r := Request{
		Page: page,
		Size: size,
	}
	return r.Sanitize()
}

func (r *Request) Offset() int {
	safe := r.Sanitize()
	return (safe.Page - 1) * safe.Size
}

func (r *Request) Limit() int {
	return r.Sanitize().Size
}

func (r Request) Sanitize() Request {
	if r.Page <= 0 {
		r.Page = DefaultPage
	}

	if r.Size <= 0 || r.Size > MaxPageSize {
		r.Size = MaxPageSize
	}

	return r
}

type Page[T any] struct {
	Items      []T
	TotalCount int
	Page       int
	Size       int
}

func NewPage[T any](items []T, totalCount, page int) *Page[T] {
	if items == nil {
		items = make([]T, 0)
	}

	return &Page[T]{
		Items:      items,
		TotalCount: totalCount,
		Page:       page,
		Size:       len(items),
	}
}

func (p *Page[T]) TotalPages() int {
	if p.Size == 0 {
		return 0
	}
	return (p.TotalCount + p.Size - 1) / p.Size
}

func MapPage[T any, U any](page *Page[T], mapper func(T) U) *Page[U] {
	mappedItems := make([]U, len(page.Items))
	for i, item := range page.Items {
		mappedItems[i] = mapper(item)
	}
	return &Page[U]{
		Items:      mappedItems,
		TotalCount: page.TotalCount,
		Page:       page.Page,
		Size:       page.Size,
	}
}
