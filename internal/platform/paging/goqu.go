package paging

import (
	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/platform/sorting"
)

// Options defines sorting, cursor, and limit parameters to apply to a query.
type Options struct {
	Sort     sorting.SortOrder
	Cursor   *Cursor
	PageSize uint
	IDColumn string
	Nullable bool
}

// ApplyPagination applies limit, sorting, and keyset cursor conditions to a goqu select dataset.
func ApplyPagination(query *goqu.SelectDataset, opts Options) *goqu.SelectDataset {
	// Apply Limit (fetch PageSize + 1 to check if there is a next page)
	query = query.Limit(opts.PageSize + 1)

	// Apply Sorting and Cursor condition
	sortCol := goqu.I(opts.Sort.Field)
	idColName := opts.IDColumn
	if idColName == "" {
		idColName = "id"
	}
	idCol := goqu.I(idColName)

	if opts.Sort.Ascending {
		query = query.Order(sortCol.Asc(), idCol.Asc())
	} else {
		query = query.Order(sortCol.Desc(), idCol.Desc())
	}

	if opts.Cursor != nil && opts.Cursor.ID != "" {
		if opts.Cursor.IsNull {
			if opts.Sort.Ascending {
				// PostgreSQL ASC defaults to NULLS LAST: remaining rows are NULLs with larger ID
				query = query.Where(goqu.And(sortCol.IsNull(), idCol.Gt(opts.Cursor.ID)))
			} else {
				// PostgreSQL DESC defaults to NULLS FIRST: remaining rows are NULLs with smaller ID, or any non-NULL rows
				query = query.Where(goqu.Or(
					goqu.And(sortCol.IsNull(), idCol.Lt(opts.Cursor.ID)),
					sortCol.IsNotNull(),
				))
			}
		} else if opts.Cursor.SortValue != "" {
			if opts.Sort.Ascending {
				// (sort_field > sort_value) OR (sort_field = sort_value AND id > cursor_id) [OR (sort_field IS NULL)]
				conds := []goqu.Expression{
					sortCol.Gt(opts.Cursor.SortValue),
					goqu.And(sortCol.Eq(opts.Cursor.SortValue), idCol.Gt(opts.Cursor.ID)),
				}
				if opts.Nullable {
					conds = append(conds, sortCol.IsNull())
				}
				query = query.Where(goqu.Or(conds...))
			} else {
				// (sort_field < sort_value) OR (sort_field = sort_value AND id < cursor_id)
				query = query.Where(goqu.Or(
					sortCol.Lt(opts.Cursor.SortValue),
					goqu.And(sortCol.Eq(opts.Cursor.SortValue), idCol.Lt(opts.Cursor.ID)),
				))
			}
		}
	}

	return query
}
