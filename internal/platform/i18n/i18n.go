// Package i18n provides content negotiation for localized responses.
//
// Clients express locale preference with the standard Accept-Language header
// using weighted quality values (e.g. "es-DO, es;q=0.9, en-US;q=0.8"). The
// negotiated language is carried in the request context and declared on the
// response via Content-Language and Vary: Accept-Language headers by the
// transport layer.
//
// Unsupported locales never fail the request: they fall back through the
// structure chain (e.g. es-DO -> es -> default en) instead of 406 Not
// Acceptable.
package i18n

import (
	"cmp"
	"context"
	"encoding/json/v2"
	"fmt"
	"io"
	"slices"
	"strconv"
	"strings"
	"sync"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

// Standard headers used for locale negotiation and cache correctness.
const (
	// AcceptLanguageHeader is the request header carrying locale preference.
	AcceptLanguageHeader = "Accept-Language"

	// ContentLanguageHeader declares the language actually served.
	ContentLanguageHeader = "Content-Language"

	// VaryHeader instructs caches to key responses by Accept-Language.
	VaryHeader = "Vary"
)

// DefaultLanguage is served when no supported language can be negotiated.
const DefaultLanguage = "en"

// SupportedLanguages lists the language tags Saturn can serve. Full tags and
// primary subtags both negotiate against this set.
var SupportedLanguages = []string{"en", "es"}

type contextKey struct{}

// Negotiate parses an Accept-Language header list with weighted q-values and
// returns the best supported language code. Unsupported tags fall back
// through their primary subtag (es-DO -> es) and finally to DefaultLanguage.
// Order is preserved for equal weights, so earlier entries win ties.
func Negotiate(header string) string {
	type entry struct {
		tag string
		q   float64
	}

	var entries []entry
	for part := range strings.SplitSeq(header, ",") {
		tagPart, params, hasParams := strings.Cut(part, ";")
		tag := strings.ToLower(strings.TrimSpace(tagPart))
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
		entries = append(entries, entry{tag: tag, q: q})
	}

	slices.SortStableFunc(entries, func(a, b entry) int {
		return cmp.Compare(b.q, a.q)
	})

	for _, e := range entries {
		if slices.Contains(SupportedLanguages, e.tag) {
			return e.tag
		}
		if primary, _, _ := strings.Cut(e.tag, "-"); slices.Contains(SupportedLanguages, primary) {
			return primary
		}
	}
	return DefaultLanguage
}

// With injects a negotiated language code into the context.
func With(ctx context.Context, language string) context.Context {
	return context.WithValue(ctx, contextKey{}, language)
}

// From extracts the negotiated language from the context. Returns an empty
// string when no negotiation has run yet.
func From(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	if lang, ok := ctx.Value(contextKey{}).(string); ok {
		return lang
	}
	return ""
}

// Resolve returns the negotiated language from the context, falling back to
// DefaultLanguage when no negotiation has run yet.
func Resolve(ctx context.Context) string {
	if lang := From(ctx); lang != "" {
		return lang
	}
	return DefaultLanguage
}

type dictionary map[string]string

// Translator resolves flattened message keys against the language negotiated
// in the request context by the transport middleware. Dictionaries are loaded
// per language with Add; nested JSON objects are flattened into dot-separated
// keys (e.g. "trigger_topics.calendar.event.created.display_name").
type Translator struct {
	mu    sync.RWMutex
	langs map[string]dictionary
}

// NewTranslator constructs an empty Translator.
func NewTranslator() *Translator {
	return &Translator{
		langs: make(map[string]dictionary),
	}
}

// Add loads a JSON message file for a language, flattening nested objects into
// dot-separated keys. Leaf values must be strings; later calls for the same
// language replace the previous dictionary.
func (t *Translator) Add(lang string, file io.Reader) error {
	const op errors.Op = "platform/i18n.Translator.Add"

	lang = strings.ToLower(strings.TrimSpace(lang))
	if lang == "" {
		return errors.E(op, errors.Invalid, "language is required")
	}

	var tree map[string]any
	if err := json.UnmarshalRead(file, &tree); err != nil {
		return errors.E(op, errors.Invalid, fmt.Errorf("parse locale %q: %w", lang, err))
	}

	dict := make(dictionary)
	flatten(dict, "", tree)

	t.mu.Lock()
	defer t.mu.Unlock()
	t.langs[lang] = dict
	return nil
}

func flatten(dict dictionary, prefix string, tree map[string]any) {
	for key, value := range tree {
		full := key
		if prefix != "" {
			full = prefix + "." + key
		}
		switch node := value.(type) {
		case map[string]any:
			flatten(dict, full, node)
		case string:
			dict[full] = node
		}
	}
}

// Lookup resolves a key for the language negotiated in ctx, falling back to
// DefaultLanguage when the key is missing from the requested language.
func (t *Translator) Lookup(ctx context.Context, key string) (string, bool) {
	lang := From(ctx)
	if lang == "" {
		lang = DefaultLanguage
	}

	t.mu.RLock()
	defer t.mu.RUnlock()

	if dict, ok := t.langs[lang]; ok {
		if val, ok := dict[key]; ok {
			return val, true
		}
	}
	if lang != DefaultLanguage {
		if dict, ok := t.langs[DefaultLanguage]; ok {
			if val, ok := dict[key]; ok {
				return val, true
			}
		}
	}
	return "", false
}

// Translate resolves a key for the language negotiated in ctx. Unknown keys
// fall back to the key itself so callers always receive a displayable string.
func (t *Translator) Translate(ctx context.Context, key string) string {
	if val, ok := t.Lookup(ctx, key); ok {
		return val
	}
	return key
}
