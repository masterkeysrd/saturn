package workflow

import (
	"context"
	"embed"
	"fmt"
	"slices"
	"sync"

	platformi18n "github.com/masterkeysrd/saturn/internal/platform/i18n"
)

//go:embed locales/*.json
var localeFS embed.FS

// catalogTranslator resolves catalog display names and descriptions from the
// embedded locale bundles against the language negotiated in the request
// context by the transport middleware.
var catalogTranslator = sync.OnceValue(func() *platformi18n.Translator {
	translator := platformi18n.NewTranslator()
	for _, lang := range platformi18n.SupportedLanguages {
		file, err := localeFS.Open("locales/" + lang + ".json")
		if err != nil {
			panic(fmt.Sprintf("workflow i18n: open embedded locale %q: %v", lang, err))
		}
		if err := translator.Add(lang, file); err != nil {
			panic(fmt.Sprintf("workflow i18n: load embedded locale %q: %v", lang, err))
		}
		file.Close()
	}
	return translator
})

// localizeCatalog returns a cloned Catalog with DisplayName and Description
// fields translated for the language negotiated in ctx. Unknown descriptors
// preserve their registered strings.
func localizeCatalog(ctx context.Context, cat Catalog) Catalog {
	out := Catalog{
		TriggerTopics: slices.Clone(cat.TriggerTopics),
		Steps:         slices.Clone(cat.Steps),
		Loaders:       slices.Clone(cat.Loaders),
		CelHelpers:    slices.Clone(cat.CelHelpers),
	}

	tr := catalogTranslator()

	for i := range out.TriggerTopics {
		key := "trigger_topics." + out.TriggerTopics[i].Topic
		if v, ok := tr.Lookup(ctx, key+".display_name"); ok {
			out.TriggerTopics[i].DisplayName = v
		}
		if v, ok := tr.Lookup(ctx, key+".description"); ok {
			out.TriggerTopics[i].Description = v
		}
	}

	for i := range out.Steps {
		key := "steps." + out.Steps[i].Type
		if v, ok := tr.Lookup(ctx, key+".display_name"); ok {
			out.Steps[i].DisplayName = v
		}
		if v, ok := tr.Lookup(ctx, key+".description"); ok {
			out.Steps[i].Description = v
		}
	}

	for i := range out.Loaders {
		key := "loaders." + out.Loaders[i].Name
		if v, ok := tr.Lookup(ctx, key+".display_name"); ok {
			out.Loaders[i].DisplayName = v
		}
		if v, ok := tr.Lookup(ctx, key+".description"); ok {
			out.Loaders[i].Description = v
		}
	}

	for i := range out.CelHelpers {
		if v, ok := tr.Lookup(ctx, "cel_helpers."+out.CelHelpers[i].Name+".description"); ok {
			out.CelHelpers[i].Description = v
		}
	}

	return out
}
