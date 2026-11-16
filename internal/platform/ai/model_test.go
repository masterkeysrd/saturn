package ai

import (
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestModel_ValidateAndApplyPatch(t *testing.T) {
	tests := []struct {
		name      string
		model     *Model
		incoming  *Model
		mask      []string
		wantErr   bool
		wantTemp  float64
		wantThink bool
	}{
		{
			name: "validates defaults and patches nested generation & thinking",
			model: &Model{
				ID:         "mdl_1",
				SpaceID:    "spc_1",
				ProviderID: "prv_1",
				ModelID:    "gemini-2.5-pro",
				Source:     ModelSourceCatalog,
				IsEnabled:  true,
			},
			incoming: &Model{
				DisplayName: "Gemini 2.5 Pro",
				Config: GenerationConfig{
					Temperature: new(0.4),
					Thinking: ThinkingConfig{
						Enabled:      true,
						Effort:       new("high"),
						BudgetTokens: new(int32(4096)),
					},
				},
			},
			mask:      []string{"display_name", "config.temperature", "config.thinking.enabled", "config.thinking.effort", "config.thinking.budget_tokens"},
			wantTemp:  0.4,
			wantThink: true,
		},
		{
			name: "rejects temperature out of range",
			model: &Model{
				ProviderID: "prv_1",
				ModelID:    "gpt-4.1",
				Config:     GenerationConfig{Temperature: new(2.5)},
			},
			wantErr: true,
		},
		{
			name: "rejects invalid thinking effort",
			model: &Model{
				ProviderID: "prv_1",
				ModelID:    "o3",
				Config: GenerationConfig{
					Thinking: ThinkingConfig{Enabled: true, Effort: new("extreme")},
				},
			},
			wantErr: true,
		},
		{
			name: "rejects missing model_id",
			model: &Model{
				ProviderID: "prv_1",
			},
			wantErr: true,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var err error
			if len(tc.mask) > 0 {
				err = tc.model.ApplyPatch(tc.incoming, tc.mask)
			} else {
				err = tc.model.Validate()
			}
			if tc.wantErr {
				if err == nil {
					t.Fatal("expected error, got nil")
				}
				if errors.KindOf(err) != errors.Invalid {
					t.Errorf("kind = %v, want Invalid", errors.KindOf(err))
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			if tc.model.Config.Temperature == nil || *tc.model.Config.Temperature != tc.wantTemp {
				t.Errorf("temperature = %v, want %v", tc.model.Config.Temperature, tc.wantTemp)
			}
			if tc.model.Config.Thinking.Enabled != tc.wantThink {
				t.Errorf("thinking.enabled = %v, want %v", tc.model.Config.Thinking.Enabled, tc.wantThink)
			}
		})
	}
}
