package i18n_test

import (
	"context"
	"strings"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/i18n"
)

func TestNegotiate(t *testing.T) {
	tests := []struct {
		name   string
		header string
		want   string
	}{
		{
			name:   "EmptyHeaderFallsBackToDefault",
			header: "",
			want:   "en",
		},
		{
			name:   "ExactSupportedTag",
			header: "es",
			want:   "es",
		},
		{
			name:   "FullTagFallsBackToPrimarySubtag",
			header: "es-DO",
			want:   "es",
		},
		{
			name:   "WeightedQValuesPickHighest",
			header: "es-DO, es;q=0.9, en-US;q=0.8",
			want:   "es",
		},
		{
			name:   "LowerWeightedEnglishWins",
			header: "es-DO;q=0.3, en-US;q=0.9",
			want:   "en",
		},
		{
			name:   "EqualWeightsKeepFirstOrder",
			header: "es, en",
			want:   "es",
		},
		{
			name:   "UnsupportedLanguageFallsToNextSupported",
			header: "de-DE, de;q=0.9, fr;q=0.5, es-MX;q=0.4",
			want:   "es",
		},
		{
			name:   "OnlyUnsupportedFallsBackToDefault",
			header: "de-DE, fr;q=0.5",
			want:   "en",
		},
		{
			name:   "ZeroQualityEntriesAreSkipped",
			header: "es;q=0, en;q=0.1",
			want:   "en",
		},
		{
			name:   "WildcardEntriesAreSkipped",
			header: "*;q=0.5, es",
			want:   "es",
		},
		{
			name:   "CaseInsensitiveTags",
			header: "ES-DO",
			want:   "es",
		},
		{
			name:   "MalformedQualityKeepsDefaultWeight",
			header: "es;q=abc",
			want:   "es",
		},
		{
			name:   "WhitespaceTolerated",
			header: " en-US ; q=0.7 , es ; q=0.95 ",
			want:   "es",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := i18n.Negotiate(tt.header); got != tt.want {
				t.Errorf("Negotiate(%q) = %q, want %q", tt.header, got, tt.want)
			}
		})
	}
}

func TestWithAndFrom(t *testing.T) {
	tests := []struct {
		name     string
		inject   string
		injectIt bool
		want     string
	}{
		{
			name:     "RoundTrip",
			inject:   "es",
			injectIt: true,
			want:     "es",
		},
		{
			name: "MissingReturnsEmpty",
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			if tt.injectIt {
				ctx = i18n.With(ctx, tt.inject)
			}
			if got := i18n.From(ctx); got != tt.want {
				t.Errorf("From() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestResolve(t *testing.T) {
	tests := []struct {
		name   string
		inject string
		want   string
	}{
		{name: "NegotiatedLanguage", inject: "es", want: "es"},
		{name: "MissingFallsBackToDefault", inject: "", want: "en"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			if tt.inject != "" {
				ctx = i18n.With(ctx, tt.inject)
			}
			if got := i18n.Resolve(ctx); got != tt.want {
				t.Errorf("Resolve() = %q, want %q", got, tt.want)
			}
		})
	}
}

const (
	enMessages = `{
  "greeting": "Hello",
  "steps": {
    "filter": {
      "display_name": "Filter",
      "description": "Keep only matching items"
    }
  }
}`
	esMessages = `{
  "steps": {
    "filter": {
      "display_name": "Filtrar",
      "description": "Conserva solo los elementos coincidentes"
    }
  }
}`
)

func TestTranslator(t *testing.T) {
	tr := i18n.NewTranslator()
	if err := tr.Add("en", strings.NewReader(enMessages)); err != nil {
		t.Fatalf("Add(en) error = %v", err)
	}
	if err := tr.Add("es", strings.NewReader(esMessages)); err != nil {
		t.Fatalf("Add(es) error = %v", err)
	}

	tests := []struct {
		name      string
		language  string
		key       string
		want      string
		wantFound bool
	}{
		{name: "SpanishLeafKey", language: "es", key: "steps.filter.display_name", want: "Filtrar", wantFound: true},
		{name: "EnglishLeafKey", language: "en", key: "steps.filter.display_name", want: "Filter", wantFound: true},
		{name: "MissingInSpanishFallsBackToEnglish", language: "es", key: "greeting", want: "Hello", wantFound: true},
		{name: "NoContextUsesDefaultLanguage", language: "", key: "greeting", want: "Hello", wantFound: true},
		{name: "UnknownKeyNotFound", language: "es", key: "steps.missing.display_name", want: "", wantFound: false},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ctx := context.Background()
			if tt.language != "" {
				ctx = i18n.With(ctx, tt.language)
			}
			got, found := tr.Lookup(ctx, tt.key)
			if got != tt.want || found != tt.wantFound {
				t.Errorf("Lookup(%q) = (%q, %v), want (%q, %v)", tt.key, got, found, tt.want, tt.wantFound)
			}
		})
	}
}

func TestTranslatorTranslateFallsBackToKey(t *testing.T) {
	tr := i18n.NewTranslator()
	if err := tr.Add("en", strings.NewReader(enMessages)); err != nil {
		t.Fatalf("Add(en) error = %v", err)
	}

	ctx := i18n.With(context.Background(), "en")
	if got := tr.Translate(ctx, "greeting"); got != "Hello" {
		t.Errorf("Translate(greeting) = %q, want %q", got, "Hello")
	}
	if got := tr.Translate(ctx, "unknown.key"); got != "unknown.key" {
		t.Errorf("Translate(unknown.key) = %q, want key fallback", got)
	}
}

func TestTranslatorAddRejectsInvalidInput(t *testing.T) {
	tr := i18n.NewTranslator()

	tests := []struct {
		name string
		lang string
		json string
	}{
		{name: "EmptyLanguage", lang: "  ", json: `{}`},
		{name: "MalformedJSON", lang: "en", json: `{not json`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if err := tr.Add(tt.lang, strings.NewReader(tt.json)); err == nil {
				t.Errorf("Add(%q) expected error, got nil", tt.lang)
			}
		})
	}
}
