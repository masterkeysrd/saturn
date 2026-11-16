package ai

import "testing"

func TestCatalog_ProvidersAndDefaultModels(t *testing.T) {
	catalog := GetProviderCatalog()
	if len(catalog) != 6 {
		t.Fatalf("expected 6 provider descriptors, got %d", len(catalog))
	}

	for _, desc := range catalog {
		if !desc.Driver.IsValid() {
			t.Errorf("invalid catalog driver %q", desc.Driver)
		}
		if desc.DisplayName == "" {
			t.Errorf("missing DisplayName for driver %q", desc.Driver)
		}
	}

	cloudDrivers := []Driver{DriverGemini, DriverOpenAI, DriverAnthropic, DriverOpenRouter}
	for _, d := range cloudDrivers {
		seeds := DefaultSeedModelsForDriver(d)
		if len(seeds) < 2 {
			t.Errorf("expected seeded models for %s, got %d", d, len(seeds))
		}
		models := make([]*Model, 0, len(seeds))
		for i, sp := range seeds {
			models = append(models, &Model{
				ID:          "mdl_" + string(rune('a'+i)),
				ModelID:     sp.ModelID,
				DisplayName: sp.DisplayName,
				Profile:     sp.Profile,
				IsEnabled:   true,
			})
			if sp.Profile.Limits.ContextWindow <= 0 {
				t.Errorf("expected non-zero ContextWindow from loom profile for %s/%s", d, sp.ModelID)
			}
		}
		roles := RoleDefaultsForSeededModels(d, models)
		if roles.DefaultModelID == nil || roles.FastModelID == nil || roles.ReasoningModelID == nil {
			t.Errorf("expected all role defaults populated for %s: %+v", d, roles)
		}
	}
}

func TestCatalog_SystemBlueprints(t *testing.T) {
	mcpSrv := SystemSaturnMCPBlueprint("spc_1")
	if err := mcpSrv.Validate(false); err != nil {
		t.Fatalf("SystemSaturnMCPBlueprint invalid: %v", err)
	}
	if !mcpSrv.IsSystem || mcpSrv.Transport != TransportInMemory || mcpSrv.Slug != "saturn" {
		t.Errorf("unexpected SystemSaturnMCPBlueprint: %+v", mcpSrv)
	}

	assistant := SystemAssistantBlueprint("spc_1", "mcp_saturn")
	if err := assistant.Validate(); err != nil {
		t.Fatalf("SystemAssistantBlueprint invalid: %v", err)
	}
	if !assistant.IsSystem || assistant.ModelID != nil || assistant.Config.Execution.ApprovalPolicy != ApprovalConfirmWrites {
		t.Errorf("unexpected SystemAssistantBlueprint: %+v", assistant)
	}
	if len(assistant.Config.MCPBindings) != 1 || !assistant.Config.MCPBindings[0].AllowsTool("finance_list_accounts") {
		t.Errorf("unexpected assistant MCP bindings: %+v", assistant.Config.MCPBindings)
	}
}
