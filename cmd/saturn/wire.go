package main

import (
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
)

func Wire(container deps.Container) error {
	if err := wireApplications(container); err != nil {
		return err
	}

	return nil
}

func wireApplications(container deps.Container) error {
	if err := wireFinanceApplication(container); err != nil {
		return err
	}

	return nil
}

func wireFinanceApplication(container deps.Container) error {
	if err := container.Provide(func(s *finance.SearchService) application.FinanceSearchService {
		return s
	}); err != nil {
		return err
	}

	return nil
}
