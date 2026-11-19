package space

import (
	"context"
	"slices"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"github.com/masterkeysrd/saturn/internal/platform/patch"
	"github.com/masterkeysrd/saturn/internal/platform/settings"
)

// DashboardPreferencesClient defines the settings operations required for per-user workspace dashboard preferences.
//
// @Mock
type DashboardPreferencesClient interface {
	Get(ctx context.Context, scopeID string) (*settings.Entry[DashboardPreferences], error)
	GetOrDefault(ctx context.Context, scopeID string, fallback DashboardPreferences) (*settings.Entry[DashboardPreferences], error)
	Save(ctx context.Context, entry *settings.Entry[DashboardPreferences]) error
}

// Supported dashboard widget identifiers.
const (
	WidgetAIQuickAsk    = "ai_quick_ask"
	WidgetNetWorth      = "net_worth"
	WidgetBudgetPace    = "budget_pace"
	WidgetUpcomingBills = "upcoming_bills"
	WidgetTodaySchedule = "today_schedule"
	WidgetPriorityMail  = "priority_mail"
	WidgetWorkflowRuns  = "workflow_runs"
)

var supportedDashboardWidgets = map[string]struct{}{
	WidgetAIQuickAsk:    {},
	WidgetNetWorth:      {},
	WidgetBudgetPace:    {},
	WidgetUpcomingBills: {},
	WidgetTodaySchedule: {},
	WidgetPriorityMail:  {},
	WidgetWorkflowRuns:  {},
}

// IsSupportedDashboardWidget returns true if id is a canonical dashboard widget identifier.
func IsSupportedDashboardWidget(id string) bool {
	_, ok := supportedDashboardWidgets[id]
	return ok
}

// DashboardPreferences represents a user's customized widget layout within a workspace.
type DashboardPreferences struct {
	Widgets []string `json:"widgets"`
}

// DashboardPreferencesKey is the typed descriptor for user-within-workspace dashboard preferences.
var DashboardPreferencesKey = settings.NewKey[DashboardPreferences](settings.ScopeUserSpace, "dashboard")

// DefaultDashboardPreferences returns the default out-of-the-box dashboard widget layout.
func DefaultDashboardPreferences() DashboardPreferences {
	return DashboardPreferences{
		Widgets: []string{
			WidgetAIQuickAsk,
			WidgetNetWorth,
			WidgetBudgetPace,
			WidgetTodaySchedule,
			WidgetPriorityMail,
		},
	}
}

// Validate checks the dashboard preferences for business rule violations.
func (p *DashboardPreferences) Validate() error {
	if p == nil {
		return errors.E(errors.Invalid, "dashboard preferences payload is required")
	}
	if len(p.Widgets) == 0 {
		return errors.E(errors.Invalid, "at least one dashboard widget is required")
	}

	seen := make(map[string]struct{}, len(p.Widgets))
	for _, w := range p.Widgets {
		if !IsSupportedDashboardWidget(w) {
			return errors.E(errors.Invalid, "unsupported dashboard widget: "+w)
		}
		if _, dup := seen[w]; dup {
			return errors.E(errors.Invalid, "duplicate dashboard widget: "+w)
		}
		seen[w] = struct{}{}
	}

	return nil
}

// DashboardPreferencesPatchSchema defines all patchable fields for DashboardPreferences.
var DashboardPreferencesPatchSchema = patch.NewSchema[DashboardPreferences]().
	Field("widgets", func(p *DashboardPreferences) *[]string { return &p.Widgets })

// ApplyPatch applies partial updates from incoming dashboard preferences based on the field mask.
func (p *DashboardPreferences) ApplyPatch(incoming *DashboardPreferences, mask []string) error {
	if incoming == nil {
		return errors.E(errors.Invalid, "dashboard preferences payload is required")
	}
	if err := DashboardPreferencesPatchSchema.Apply(p, incoming, mask); err != nil {
		return errors.E(errors.Invalid, err)
	}
	p.Widgets = slices.Clone(p.Widgets)
	return p.Validate()
}
