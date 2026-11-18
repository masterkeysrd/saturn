package financeapp

import (
	"context"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/workflow"
)

// WorkflowDependencies provides domain services needed by finance workflow loaders and actions.
type WorkflowDependencies struct {
	FinanceService FinanceService
	SpaceService   SpaceService
	Transactor     db.Transactor
}

// RegisterWorkflows registers finance DataLoaders, Action Steps, and System Flows onto reg.
func RegisterWorkflows(reg *workflow.Registry, deps WorkflowDependencies) {
	registerFinanceLoaders(reg, deps)
	registerFinanceSteps(reg, deps)
	registerFinanceSystemFlows(reg)
}

func resolveWorkflowFinanceContext(ctx context.Context, deps WorkflowDependencies, spaceID string) finance.Context {
	loc := time.UTC
	if entry, err := deps.SpaceService.GetSettings(ctx, space.Session{SpaceID: space.SpaceID(spaceID)}); err == nil && entry != nil && entry.Value.Timezone != "" {
		if parsedLoc, locErr := time.LoadLocation(entry.Value.Timezone); locErr == nil {
			loc = parsedLoc
		}
	}

	baseCurrency := finance.Currency("USD")
	if fEntry, err := deps.FinanceService.GetSettings(ctx, finance.SpaceID(spaceID)); err == nil && fEntry != nil && fEntry.Value.BaseCurrency != "" {
		baseCurrency = fEntry.Value.BaseCurrency
	}

	return finance.NewContext(finance.SpaceID(spaceID), "workflow", loc, baseCurrency)
}
