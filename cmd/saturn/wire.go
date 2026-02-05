package main

import (
	"fmt"

	financepb "github.com/masterkeysrd/saturn/gen/proto/go/saturn/finance/v1"
	"github.com/masterkeysrd/saturn/internal/application"
	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/pkg/deps"
	financepg "github.com/masterkeysrd/saturn/internal/storage/pg/finance"
	financegrpc "github.com/masterkeysrd/saturn/internal/transport/grpc/servers/finance"
)

func Wire(container deps.Container) error {
	if err := WireFinanceServers(container); err != nil {
		return fmt.Errorf("cannot wire finance servers: %w", err)
	}

	if err := WireApplications(container); err != nil {
		return fmt.Errorf("cannot wire applications: %w", err)
	}

	if err := WireFinanceDomain(container); err != nil {
		return fmt.Errorf("cannot wire finance domain: %w", err)
	}

	if err := WireFinanceStoragePg(container); err != nil {
		return fmt.Errorf("cannot wire finance storage pg: %w", err)
	}

	return nil
}

func WireApplications(container deps.Container) error {
	if err := container.Provide(
		application.NewFinanceApp,
		deps.As(
			new(financegrpc.FinanceApplication),
			new(financegrpc.InsightsApplication),
		),
	); err != nil {
		return err
	}

	return nil
}

func WireFinanceServers(container deps.Container) error {
	if err := container.Provide(
		financegrpc.NewFinanceServer,
		deps.As(new(financepb.FinanceServer)),
	); err != nil {
		return err
	}

	if err := container.Provide(
		financegrpc.NewInsightsServer,
		deps.As(new(financepb.InsightsServer)),
	); err != nil {
		return err
	}

	return nil
}

func WireFinanceDomain(container deps.Container) error {
	if err := container.Provide(
		finance.NewService,
		deps.As(new(application.FinanceService)),
	); err != nil {
		return err
	}

	if err := container.Provide(
		finance.NewSearchService,
		deps.As(new(application.FinanceSearchService)),
	); err != nil {
		return err
	}

	if err := container.Provide(
		finance.NewInsightsService,
		deps.As(new(application.FinanceInsightsService)),
	); err != nil {
		return err
	}

	return nil
}

func WireFinanceStoragePg(inj deps.Injector) error {
	if err := inj.Provide(
		financepg.NewBudgetStore,
		deps.As(new(finance.BudgetStore)),
	); err != nil {
		return err
	}

	if err := inj.Provide(
		financepg.NewBudgetPeriodStore,
		deps.As(new(finance.BudgetPeriodStore)),
	); err != nil {
		return err
	}

	if err := inj.Provide(
		financepg.NewBudgetSearcher,
		deps.As(new(finance.BudgetSearcher)),
	); err != nil {
		return err
	}

	if err := inj.Provide(
		financepg.NewInsightsStore,
		deps.As(new(finance.InsightsStore)),
	); err != nil {
		return err
	}

	if err := inj.Provide(
		financepg.NewTransactionsStore,
		deps.As(new(finance.TransactionStore)),
	); err != nil {
		return err
	}

	if err := inj.Provide(
		financepg.NewTransactionSearcher,
		deps.As(new(finance.TransactionSearcher)),
	); err != nil {
		return err
	}

	if err := inj.Provide(
		financepg.NewExchangeRateStore,
		deps.As(new(finance.ExchangeRateStore)),
	); err != nil {
		return err
	}

	if err := inj.Provide(
		financepg.NewSettingsStore,
		deps.As(new(finance.SettingsStore)),
	); err != nil {
		return err
	}

	return nil
}
