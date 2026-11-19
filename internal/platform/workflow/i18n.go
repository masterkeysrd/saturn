package workflow

import (
	"embed"
	"encoding/json/v2"
	"fmt"
	"slices"
	"strconv"
	"strings"
	"sync"
)

//go:embed locales/*.json
var localeFS embed.FS

type catalogEntryTranslation struct {
	DisplayName string `json:"display_name"`
	Description string `json:"description"`
}

type celHelperTranslation struct {
	Description string `json:"description"`
}

type catalogLocaleBundle struct {
	TriggerTopics map[string]catalogEntryTranslation `json:"trigger_topics"`
	Steps         map[string]catalogEntryTranslation `json:"steps"`
	Loaders       map[string]catalogEntryTranslation `json:"loaders"`
	CelHelpers    map[string]celHelperTranslation    `json:"cel_helpers"`
}

var loadCatalogLocales = sync.OnceValue(func() map[string]catalogLocaleBundle {
	bundles := make(map[string]catalogLocaleBundle, 2)
	for _, lang := range []string{"en", "es"} {
		data, err := localeFS.ReadFile("locales/" + lang + ".json")
		if err != nil {
			panic(fmt.Sprintf("workflow i18n: read embedded locale %q: %v", lang, err))
		}
		var bundle catalogLocaleBundle
		if err := json.Unmarshal(data, &bundle); err != nil {
			panic(fmt.Sprintf("workflow i18n: parse embedded locale %q: %v", lang, err))
		}
		bundles[lang] = bundle
	}
	return bundles
})

// ResolveCatalogLanguage parses a BCP-47 locale tag or HTTP Accept-Language header list
// and returns a supported catalog language code ("en" or "es"), defaulting to "en".
func ResolveCatalogLanguage(locale string) string {
	bestLang := ""
	bestQ := -1.0

	for part := range strings.SplitSeq(locale, ",") {
		tagPart, params, hasParams := strings.Cut(part, ";")
		tag := strings.TrimSpace(tagPart)
		if tag == "" || tag == "*" {
			continue
		}

		q := 1.0
		if hasParams {
			for param := range strings.SplitSeq(params, ";") {
				k, v, ok := strings.Cut(strings.TrimSpace(param), "=")
				if !ok || !strings.EqualFold(strings.TrimSpace(k), "q") {
					continue
				}
				if parsed, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
					q = parsed
				}
			}
		}
		if q <= 0 {
			continue
		}

		primary, _, _ := strings.Cut(tag, "-")
		lang := strings.ToLower(strings.TrimSpace(primary))
		if lang != "en" && lang != "es" {
			continue
		}

		if q > bestQ {
			bestQ = q
			bestLang = lang
		}
	}

	if bestLang == "" {
		return "en"
	}
	return bestLang
}

// LocalizeCatalog returns a cloned Catalog with DisplayName and Description fields localized
// for the resolved locale language. Unknown descriptors preserve their registered strings.
func LocalizeCatalog(cat Catalog, locale string) Catalog {
	out := Catalog{
		TriggerTopics: slices.Clone(cat.TriggerTopics),
		Steps:         slices.Clone(cat.Steps),
		Loaders:       slices.Clone(cat.Loaders),
		CelHelpers:    slices.Clone(cat.CelHelpers),
	}

	lang := ResolveCatalogLanguage(locale)
	if lang != "es" {
		return out
	}

	bundle := loadCatalogLocales()[lang]

	for i := range out.TriggerTopics {
		if tr, ok := bundle.TriggerTopics[out.TriggerTopics[i].Topic]; ok {
			out.TriggerTopics[i].DisplayName = tr.DisplayName
			out.TriggerTopics[i].Description = tr.Description
		}
	}

	for i := range out.Steps {
		if tr, ok := bundle.Steps[out.Steps[i].Type]; ok {
			out.Steps[i].DisplayName = tr.DisplayName
			out.Steps[i].Description = tr.Description
		}
	}

	for i := range out.Loaders {
		if tr, ok := bundle.Loaders[out.Loaders[i].Name]; ok {
			out.Loaders[i].DisplayName = tr.DisplayName
			out.Loaders[i].Description = tr.Description
		}
	}

	for i := range out.CelHelpers {
		if tr, ok := bundle.CelHelpers[out.CelHelpers[i].Name]; ok {
			out.CelHelpers[i].Description = tr.Description
		}
	}

	return out
}
