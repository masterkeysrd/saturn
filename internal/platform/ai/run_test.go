package ai

import (
	"math"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestSettings_And_EstimateCostUSD(t *testing.T) {
	s := DefaultSettings()
	if s.Governance.RunRetentionDays != 90 {
		t.Fatalf("default retention = %d, want 90", s.Governance.RunRetentionDays)
	}
	if err := s.ApplyPatch(&Settings{
		Models:     ModelRoleSettings{DefaultModelID: new("mdl_1"), FastModelID: new("mdl_2")},
		Governance: GovernanceConfig{MonthlyBudgetUSD: new(25.5), RunRetentionDays: 30},
	}, []string{"models.default_model_id", "models.fast_model_id", "governance.monthly_budget_usd", "governance.run_retention_days"}); err != nil {
		t.Fatalf("ApplyPatch failed: %v", err)
	}
	if *s.Models.DefaultModelID != "mdl_1" || *s.Governance.MonthlyBudgetUSD != 25.5 || s.Governance.RunRetentionDays != 30 {
		t.Errorf("unexpected settings: %+v", s)
	}
	if err := s.ApplyPatch(&Settings{Governance: GovernanceConfig{MonthlyBudgetUSD: new(-1.0)}}, []string{"governance.monthly_budget_usd"}); !errors.Is(err, errors.Invalid) {
		t.Errorf("expected Invalid for negative budget, got %v", err)
	}

	usage := TokenUsage{Input: 100_000, Cached: 40_000, Output: 10_000, Reasoning: 5_000, Total: 115_000}
	pricing := ModelPricing{InputPerMillionUSD: 3.0, CachedInputPerMillionUSD: 0.75, OutputPerMillionUSD: 15.0}
	// uncached input: 60k * 3/1M = 0.18; cached: 40k * 0.75/1M = 0.03; output+reasoning: 15k * 15/1M = 0.225 -> total 0.435
	gotCost := EstimateCostUSD(usage, pricing)
	if math.Abs(gotCost-0.435) > 1e-9 {
		t.Errorf("EstimateCostUSD = %v, want 0.435", gotCost)
	}

	if err := ValidateRunID("run_2n1q2w3e4r5t6y7u8i9o0p1a2s3"); err != nil {
		t.Errorf("expected legacy run_ prefix accepted: %v", err)
	}
	airID, err := GenerateRunID()
	if err != nil {
		t.Fatalf("GenerateRunID failed: %v", err)
	}
	if err := ValidateRunID(airID); err != nil {
		t.Errorf("ValidateRunID(%q) failed: %v", airID, err)
	}
}
