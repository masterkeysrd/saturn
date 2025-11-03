package budget

import (
	"context"
)

type Repository interface {
	Store(context.Context, *Budget) error
	List(context.Context) ([]*Budget, error)
}
