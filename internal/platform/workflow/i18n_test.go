package workflow

import (
	"context"
	"embed"
	"encoding/json/v2"
	"maps"
	"slices"
	"strings"
	"testing"

	platformi18n "github.com/masterkeysrd/saturn/internal/platform/i18n"
)

func TestLocalizeCatalog(t *testing.T) {
	reg := NewRegistry()

	allTopics := []string{
		"calendar.event.created",
		"calendar.event.updated",
		"finance.scheduled_transaction.created",
		"finance.scheduled_transaction.updated",
		"finance.scheduled_transaction.paid",
		"finance.inbox_item.created",
		"finance.inbox_item.approved",
		"finance.transaction.created",
		"mail.message.received",
	}
	for _, topic := range allTopics {
		reg.RegisterTriggerTopic(TriggerTopicDescriptor{
			Topic:       topic,
			Domain:      "test",
			DisplayName: "EN " + topic,
			Description: "EN desc " + topic,
		})
	}
	reg.RegisterTriggerTopic(TriggerTopicDescriptor{
		Topic:       "test.unknown.topic",
		Domain:      "test",
		DisplayName: "Custom Topic",
		Description: "Custom topic description",
	})

	domainSteps := []string{
		"calendar.upsert_event",
		"finance.create_inbox_item",
		"finance.import_statement_draft",
		"mail.create_draft",
		"mail.modify_labels",
		"mail.save_thread_summary",
		"test.unknown_step",
	}
	for _, stepType := range domainSteps {
		reg.RegisterStep(StepDescriptor{
			Type:        stepType,
			Owner:       "test",
			Category:    "action",
			DisplayName: "EN " + stepType,
			Description: "EN desc " + stepType,
		}, func(_ context.Context, _ *StepContext[map[string]any]) (map[string]any, error) {
			return nil, nil
		})
	}

	loaders := []string{
		"calendar.calendars",
		"calendar.events",
		"calendar.event",
		"finance.accounts",
		"finance.account",
		"finance.budgets",
		"finance.budget",
		"finance.transactions",
		"finance.scheduled_payments",
		"finance.borrowings",
		"finance.recurring_templates",
		"mail.message",
		"mail.mailboxes",
		"mail.thread",
		"test.unknown_loader",
	}
	for _, loaderName := range loaders {
		reg.RegisterLoader(LoaderDescriptor{
			Name:        loaderName,
			Owner:       "test",
			DisplayName: "EN " + loaderName,
			Description: "EN desc " + loaderName,
		}, func(_ context.Context, _ string, _ map[string]any) (any, error) {
			return nil, nil
		})
	}

	base := reg.Catalog()
	esCat := localizeCatalog(platformi18n.With(t.Context(), "es"), base)
	enCat := localizeCatalog(platformi18n.With(t.Context(), "en"), base)
	noneCat := localizeCatalog(t.Context(), base)

	// Verify registry snapshot was never mutated.
	after := reg.Catalog()
	for i := range base.Steps {
		if after.Steps[i].DisplayName != base.Steps[i].DisplayName {
			t.Fatalf("registry step %q mutated: %q != %q", base.Steps[i].Type, after.Steps[i].DisplayName, base.Steps[i].DisplayName)
		}
		// English and a missing negotiated language must produce the same catalog.
		if enCat.Steps[i].DisplayName != noneCat.Steps[i].DisplayName || enCat.Steps[i].Description != noneCat.Steps[i].Description {
			t.Fatalf("step %q english mismatch: (%q, %q) != (%q, %q)", base.Steps[i].Type,
				enCat.Steps[i].DisplayName, enCat.Steps[i].Description,
				noneCat.Steps[i].DisplayName, noneCat.Steps[i].Description)
		}
		// Descriptors absent from the bundles keep their registered strings.
		if base.Steps[i].Type == "test.unknown_step" &&
			(enCat.Steps[i].DisplayName != base.Steps[i].DisplayName || noneCat.Steps[i].DisplayName != base.Steps[i].DisplayName) {
			t.Fatalf("unknown step %q should preserve registered strings", base.Steps[i].Type)
		}
	}

	// Verify every registered trigger topic, step, loader, and CEL helper translates in Spanish,
	// while unknown descriptors preserve their fallback strings.
	for i, topic := range esCat.TriggerTopics {
		if topic.Topic == "test.unknown.topic" {
			if topic.DisplayName != "Custom Topic" || topic.Description != "Custom topic description" {
				t.Fatalf("unknown topic should preserve fallback, got %+v", topic)
			}
			continue
		}
		if topic.DisplayName == base.TriggerTopics[i].DisplayName || topic.Description == base.TriggerTopics[i].Description {
			t.Fatalf("topic %q was not localized in Spanish: %+v", topic.Topic, topic)
		}
	}

	for i, step := range esCat.Steps {
		if step.Type == "test.unknown_step" {
			if step.DisplayName != "EN test.unknown_step" || step.Description != "EN desc test.unknown_step" {
				t.Fatalf("unknown step should preserve fallback, got %+v", step)
			}
			continue
		}
		if step.DisplayName == base.Steps[i].DisplayName || step.Description == base.Steps[i].Description {
			t.Fatalf("step %q was not localized in Spanish: %+v", step.Type, step)
		}
	}

	for i, loader := range esCat.Loaders {
		if loader.Name == "test.unknown_loader" {
			if loader.DisplayName != "EN test.unknown_loader" || loader.Description != "EN desc test.unknown_loader" {
				t.Fatalf("unknown loader should preserve fallback, got %+v", loader)
			}
			continue
		}
		if loader.DisplayName == base.Loaders[i].DisplayName || loader.Description == base.Loaders[i].Description {
			t.Fatalf("loader %q was not localized in Spanish: %+v", loader.Name, loader)
		}
	}

	for i, helper := range esCat.CelHelpers {
		if helper.Description == base.CelHelpers[i].Description {
			t.Fatalf("CEL helper %q was not localized in Spanish: %+v", helper.Name, helper)
		}
	}
}

//go:embed locales/*.json
var parityLocaleFS embed.FS

type parityCatalogEntry struct {
	DisplayName string `json:"display_name"`
	Description string `json:"description"`
}

type parityCelHelper struct {
	Description string `json:"description"`
}

type parityCatalogBundle struct {
	TriggerTopics map[string]parityCatalogEntry `json:"trigger_topics"`
	Steps         map[string]parityCatalogEntry `json:"steps"`
	Loaders       map[string]parityCatalogEntry `json:"loaders"`
	CelHelpers    map[string]parityCelHelper    `json:"cel_helpers"`
}

func TestEmbeddedLocaleParity(t *testing.T) {
	bundles := make(map[string]parityCatalogBundle, 2)
	for _, lang := range []string{"en", "es"} {
		data, err := parityLocaleFS.ReadFile("locales/" + lang + ".json")
		if err != nil {
			t.Fatalf("read embedded locale %q: %v", lang, err)
		}
		var bundle parityCatalogBundle
		if err := json.Unmarshal(data, &bundle); err != nil {
			t.Fatalf("unmarshal embedded locale %q: %v", lang, err)
		}
		bundles[lang] = bundle
	}

	en := bundles["en"]
	es := bundles["es"]

	assertEntryParity := func(section string, enMap, esMap map[string]parityCatalogEntry) {
		t.Helper()
		enKeys := slices.Sorted(maps.Keys(enMap))
		esKeys := slices.Sorted(maps.Keys(esMap))
		if !slices.Equal(enKeys, esKeys) {
			t.Fatalf("%s key mismatch: en=%v es=%v", section, enKeys, esKeys)
		}
		for _, k := range enKeys {
			if strings.TrimSpace(enMap[k].DisplayName) == "" || strings.TrimSpace(enMap[k].Description) == "" {
				t.Fatalf("en %s[%q] has empty display_name or description", section, k)
			}
			if strings.TrimSpace(esMap[k].DisplayName) == "" || strings.TrimSpace(esMap[k].Description) == "" {
				t.Fatalf("es %s[%q] has empty display_name or description", section, k)
			}
		}
	}

	assertEntryParity("trigger_topics", en.TriggerTopics, es.TriggerTopics)
	assertEntryParity("steps", en.Steps, es.Steps)
	assertEntryParity("loaders", en.Loaders, es.Loaders)

	enHelperKeys := slices.Sorted(maps.Keys(en.CelHelpers))
	esHelperKeys := slices.Sorted(maps.Keys(es.CelHelpers))
	if !slices.Equal(enHelperKeys, esHelperKeys) {
		t.Fatalf("cel_helpers key mismatch: en=%v es=%v", enHelperKeys, esHelperKeys)
	}
	for _, k := range enHelperKeys {
		if strings.TrimSpace(en.CelHelpers[k].Description) == "" {
			t.Fatalf("en cel_helpers[%q] has empty description", k)
		}
		if strings.TrimSpace(es.CelHelpers[k].Description) == "" {
			t.Fatalf("es cel_helpers[%q] has empty description", k)
		}
	}

	// Verify built-in steps and CEL helpers registered by NewRegistry() all exist in both locales.
	reg := NewRegistry()
	cat := reg.Catalog()
	for _, step := range cat.Steps {
		if _, ok := en.Steps[step.Type]; !ok {
			t.Fatalf("builtin step %q missing from en.json", step.Type)
		}
	}
	for _, helper := range cat.CelHelpers {
		if _, ok := en.CelHelpers[helper.Name]; !ok {
			t.Fatalf("builtin CEL helper %q missing from en.json", helper.Name)
		}
	}
}
