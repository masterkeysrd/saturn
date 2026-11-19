package workflow

import (
	"context"
	"encoding/json/v2"
	"maps"
	"slices"
	"strings"
	"testing"
)

func TestResolveCatalogLanguage(t *testing.T) {
	tests := []struct {
		name   string
		locale string
		want   string
	}{
		{name: "empty defaults to en", locale: "", want: "en"},
		{name: "en-US", locale: "en-US", want: "en"},
		{name: "es", locale: "es", want: "es"},
		{name: "es-ES", locale: "es-ES", want: "es"},
		{name: "es-419", locale: "es-419", want: "es"},
		{name: "Accept-Language es-DO primary", locale: "es-DO,es;q=0.9,en;q=0.8", want: "es"},
		{name: "Accept-Language higher q wins", locale: "en-US;q=0.5,es-ES;q=0.9", want: "es"},
		{name: "Accept-Language unsupported then es", locale: "fr-FR,es-MX;q=0.8,en;q=0.5", want: "es"},
		{name: "Accept-Language q=0 ignored", locale: "es;q=0,en;q=0.8", want: "en"},
		{name: "unknown locale falls back to en", locale: "ja-JP", want: "en"},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := ResolveCatalogLanguage(tc.locale); got != tc.want {
				t.Fatalf("ResolveCatalogLanguage(%q) = %q, want %q", tc.locale, got, tc.want)
			}
		})
	}
}

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
	esCat := LocalizeCatalog(base, "es-DO,es;q=0.9")
	enCat := LocalizeCatalog(base, "en-US")

	// Verify registry snapshot was never mutated.
	after := reg.Catalog()
	for i := range base.Steps {
		if after.Steps[i].DisplayName != base.Steps[i].DisplayName {
			t.Fatalf("registry step %q mutated: %q != %q", base.Steps[i].Type, after.Steps[i].DisplayName, base.Steps[i].DisplayName)
		}
		if enCat.Steps[i].DisplayName != base.Steps[i].DisplayName {
			t.Fatalf("enCat step %q mismatch: %q != %q", base.Steps[i].Type, enCat.Steps[i].DisplayName, base.Steps[i].DisplayName)
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

func TestEmbeddedLocaleParity(t *testing.T) {
	bundles := make(map[string]catalogLocaleBundle, 2)
	for _, lang := range []string{"en", "es"} {
		data, err := localeFS.ReadFile("locales/" + lang + ".json")
		if err != nil {
			t.Fatalf("read embedded locale %q: %v", lang, err)
		}
		var bundle catalogLocaleBundle
		if err := json.Unmarshal(data, &bundle); err != nil {
			t.Fatalf("unmarshal embedded locale %q: %v", lang, err)
		}
		bundles[lang] = bundle
	}

	en := bundles["en"]
	es := bundles["es"]

	assertEntryParity := func(section string, enMap, esMap map[string]catalogEntryTranslation) {
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
