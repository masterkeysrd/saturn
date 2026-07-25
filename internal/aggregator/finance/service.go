package financeaggregator

import (
	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

// Service coordinates data fetching across multiple domain operations for aggregated queries.
type Service struct {
	financeService *finance.Service
}

// NewService instantiates a new Service.
func NewService(fs *finance.Service) *Service {
	return &Service{
		financeService: fs,
	}
}
