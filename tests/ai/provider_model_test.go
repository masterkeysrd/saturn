//go:build integration

package ai_test

import (
	"testing"

	aiv1 "github.com/masterkeysrd/saturn/apis/saturn/platform/ai/v1"
	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	"github.com/masterkeysrd/saturn/tests/driver"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

func TestAI_ProviderAndModelLifecycle(t *testing.T) {
	d := driver.New(t, testEnv)

	d.Auth().CreateApprovedUser(t).Login(t)
	ownerToken := d.State().AccessToken

	d.Space().Ensure(t, "AI Provider Workspace")
	spaceID := d.State().SpaceID

	// Create a second user with 'member' role to verify RBAC enforcement.
	d.Auth().CreateApprovedUser(t).Login(t)
	memberID := d.State().UserID
	memberToken := d.State().AccessToken

	d.State().AccessToken = ownerToken
	_, err := d.Space().CreateSpaceMember(t, spaceID, memberID, spacev1.SpaceMember_MEMBER)
	require.NoError(t, err)

	mockLLM := driver.StartMockLLMServer(t, "Budget check passed.")

	t.Run("Provider descriptors, catalog auto-seeding, and secret masking", func(t *testing.T) {
		descResp, err := d.AI().Client().ListProviderDescriptors(t.Context(), &aiv1.ListProviderDescriptorsRequest{})
		require.NoError(t, err)
		var drivers []string
		for _, desc := range descResp.GetProviders() {
			drivers = append(drivers, desc.GetDriver())
		}
		assert.Contains(t, drivers, "openai")
		assert.Contains(t, drivers, "anthropic")
		assert.Contains(t, drivers, "gemini")
		assert.Contains(t, drivers, "ollama")
		assert.Contains(t, drivers, "openai_compatible")

		// Creating a Gemini provider auto-seeds curated Gemini models and initializes role defaults.
		gemProv, err := d.AI().Client().CreateProvider(t.Context(), &aiv1.CreateProviderRequest{
			Provider: &aiv1.Provider{
				Name:      "Workspace Gemini",
				Driver:    "gemini",
				IsEnabled: true,
				Secret:    &aiv1.ProviderSecretInput{ApiKey: new("AIzaMockSecret123")},
			},
		})
		require.NoError(t, err)
		assert.True(t, gemProv.GetHasSecret())
		assert.Nil(t, gemProv.GetSecret())

		fetchedProv, err := d.AI().Client().GetProvider(t.Context(), &aiv1.GetProviderRequest{Id: gemProv.GetId()})
		require.NoError(t, err)
		assert.True(t, fetchedProv.GetHasSecret())
		assert.Nil(t, fetchedProv.GetSecret())

		seededModels, err := d.AI().Client().ListModels(t.Context(), &aiv1.ListModelsRequest{
			ProviderId: new(gemProv.GetId()),
		})
		require.NoError(t, err)
		assert.NotEmpty(t, seededModels.GetModels(), "expected Gemini provider creation to auto-seed curated models")

		settings, err := d.AI().Client().GetSettings(t.Context(), &aiv1.GetSettingsRequest{})
		require.NoError(t, err)
		require.NotNil(t, settings.GetModels())
		assert.NotEmpty(t, settings.GetModels().GetDefaultModelId())
		assert.NotEmpty(t, settings.GetModels().GetFastModelId())
		assert.NotEmpty(t, settings.GetModels().GetReasoningModelId())
	})

	t.Run("Mock OpenAI provider discovery, sync, model CRUD, and monthly budget enforcement", func(t *testing.T) {
		prov, err := d.AI().Client().CreateProvider(t.Context(), &aiv1.CreateProviderRequest{
			Provider: &aiv1.Provider{
				Name:      "Mock Local OpenAI",
				Driver:    "openai_compatible",
				IsEnabled: true,
				Config:    &aiv1.ProviderConfig{BaseUrl: new(mockLLM.URL)},
				Secret:    &aiv1.ProviderSecretInput{ApiKey: new("sk-mock-local")},
			},
		})
		require.NoError(t, err)

		tested, err := d.AI().Client().TestProvider(t.Context(), &aiv1.TestProviderRequest{Id: prov.GetId()})
		require.NoError(t, err)
		require.NotNil(t, tested.GetStatus())
		assert.Equal(t, "healthy", tested.GetStatus().GetState())

		discResp, err := d.AI().Client().DiscoverProviderModels(t.Context(), &aiv1.DiscoverProviderModelsRequest{Id: prov.GetId()})
		require.NoError(t, err)
		var discIDs []string
		for _, dm := range discResp.GetModels() {
			discIDs = append(discIDs, dm.GetModelId())
		}
		assert.Contains(t, discIDs, "gpt-4o")
		assert.Contains(t, discIDs, "gpt-4o-mini")

		syncResp, err := d.AI().Client().SyncProviderModels(t.Context(), &aiv1.SyncProviderModelsRequest{
			Id:       prov.GetId(),
			ModelIds: []string{"gpt-4o-mini"},
		})
		require.NoError(t, err)
		assert.Equal(t, int32(1), syncResp.GetAddedCount())
		require.Len(t, syncResp.GetModels(), 1)

		// Create a custom priced model to test CRUD and monthly budget exhaustion.
		pricedModel, err := d.AI().Client().CreateModel(t.Context(), &aiv1.CreateModelRequest{
			Model: &aiv1.Model{
				ProviderId:  prov.GetId(),
				ModelId:     "gpt-4o",
				DisplayName: "Priced GPT-4o",
				IsEnabled:   true,
				Profile: &aiv1.ModelProfile{
					Pricing: &aiv1.ModelPricing{
						InputPerMillionUsd:  100.0,
						OutputPerMillionUsd: 100.0,
					},
				},
			},
		})
		require.NoError(t, err)

		updatedModel, err := d.AI().Client().UpdateModel(t.Context(), &aiv1.UpdateModelRequest{
			Id: pricedModel.GetId(),
			Model: &aiv1.Model{
				DisplayName: "Priced GPT-4o Updated",
			},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"display_name"}},
		})
		require.NoError(t, err)
		assert.Equal(t, "Priced GPT-4o Updated", updatedModel.GetDisplayName())

		// Configure a tight monthly budget ($0.001) and point default model to pricedModel.
		_, err = d.AI().Client().UpdateSettings(t.Context(), &aiv1.UpdateSettingsRequest{
			Settings: &aiv1.Settings{
				Models: &aiv1.ModelRoleSettings{
					DefaultModelId: new(pricedModel.GetId()),
				},
				Governance: &aiv1.GovernanceConfig{
					MonthlyBudgetUsd: new(0.001),
					RunRetentionDays: 30,
				},
			},
			UpdateMask: &fieldmaskpb.FieldMask{
				Paths: []string{"models.default_model_id", "governance.monthly_budget_usd", "governance.run_retention_days"},
			},
		})
		require.NoError(t, err)

		// First Generate succeeds (40 tokens at $100/M = $0.004 > $0.001 budget).
		run1, err := d.AI().Client().Generate(t.Context(), &aiv1.GenerateRequest{
			Prompt: "Summarize spending",
		})
		require.NoError(t, err)
		assert.Equal(t, "completed", run1.GetStatus())
		require.NotNil(t, run1.GetMetrics())
		assert.Greater(t, run1.GetMetrics().GetEstimatedCostUsd(), 0.001)

		settingsAfter, err := d.AI().Client().GetSettings(t.Context(), &aiv1.GetSettingsRequest{})
		require.NoError(t, err)
		assert.Greater(t, settingsAfter.GetCurrentMonthSpendUsd(), 0.001)

		// Second Generate must be blocked by monthly budget governance.
		_, err = d.AI().Client().Generate(t.Context(), &aiv1.GenerateRequest{
			Prompt: "Should fail budget check",
		})
		require.Error(t, err)
		assert.Contains(t, err.Error(), "budget")

		// Clean up custom model.
		_, err = d.AI().Client().DeleteModel(t.Context(), &aiv1.DeleteModelRequest{Id: syncResp.GetModels()[0].GetId()})
		require.NoError(t, err)
	})

	t.Run("Member role cannot mutate workspace AI providers, models, MCP servers, or agents", func(t *testing.T) {
		d.State().AccessToken = memberToken
		defer func() { d.State().AccessToken = ownerToken }()

		_, err := d.AI().Client().CreateProvider(t.Context(), &aiv1.CreateProviderRequest{
			Provider: &aiv1.Provider{
				Name:      "Denied Provider",
				Driver:    "openai_compatible",
				IsEnabled: true,
				Config:    &aiv1.ProviderConfig{BaseUrl: new(mockLLM.URL)},
			},
		})
		require.Error(t, err)

		_, err = d.AI().Client().UpdateSettings(t.Context(), &aiv1.UpdateSettingsRequest{
			Settings: &aiv1.Settings{
				Governance: &aiv1.GovernanceConfig{RunRetentionDays: 10},
			},
			UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"governance.run_retention_days"}},
		})
		require.Error(t, err)

		_, err = d.AI().Client().CreateAgent(t.Context(), &aiv1.CreateAgentRequest{
			Agent: &aiv1.Agent{
				Slug: "denied-agent",
				Name: "Denied Agent",
			},
		})
		require.Error(t, err)
	})
}
