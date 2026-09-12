package main

import (
	"os"
	"testing"
)

func TestIsExcluded(t *testing.T) {
	patterns := []string{
		"apis/**",
		"*.pb.go",
		"tools/**",
		"apps/web/**",
		"migrations/**",
	}

	tests := []struct {
		relFile  string
		relPkg   string
		expected bool
	}{
		// Protobuf generated files and packages
		{"apis/saturn/finance/v1/finance.pb.go", "apis/saturn/finance/v1", true},
		{"apis/saturn/space/v1/space.pb.go", "apis/saturn/space/v1", true},
		{"apis/saturn/client.go", "apis/saturn", true},
		{"internal/domain/finance/finance.pb.go", "internal/domain/finance", true}, // matches *.pb.go

		// Tools and web
		{"tools/covercheck/main.go", "tools/covercheck", true},
		{"apps/web/node_modules/pkg/index.go", "apps/web/node_modules/pkg", true},
		{"migrations/001_init.sql", "migrations", true},

		// Real application packages (must NOT be excluded)
		{"api/config.go", "api", false},
		{"cmd/saturn/main.go", "cmd/saturn", false},
		{"cmd/saturn/app/config.go", "cmd/saturn/app", false},
		{"internal/application/finance/finance.go", "internal/application/finance", false},
		{"internal/domain/finance/account.go", "internal/domain/finance", false},
		{"internal/platform/errors/errors.go", "internal/platform/errors", false},
	}

	for _, tt := range tests {
		got := isExcluded(tt.relFile, tt.relPkg, patterns)
		if got != tt.expected {
			t.Errorf("isExcluded(%q, %q) = %v, expected %v", tt.relFile, tt.relPkg, got, tt.expected)
		}
	}
}

func TestLoadConfig(t *testing.T) {
	yamlContent := `
min_coverage: 30.5
coverprofile: custom/coverage.out
summary: custom_summary.md
filter_profile: false
exclude:
  - "apis/**"
  - "tools/**"
`
	tmpFile, err := os.CreateTemp("", "covercheck_test_*.yaml")
	if err != nil {
		t.Fatalf("failed to create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())

	if _, err := tmpFile.WriteString(yamlContent); err != nil {
		t.Fatalf("failed to write temp file: %v", err)
	}
	_ = tmpFile.Close()

	cfg, err := loadConfig(tmpFile.Name())
	if err != nil {
		t.Fatalf("loadConfig failed: %v", err)
	}

	if cfg.MinCoverage != 30.5 {
		t.Errorf("expected MinCoverage 30.5, got %v", cfg.MinCoverage)
	}
	if cfg.CoverProfile != "custom/coverage.out" {
		t.Errorf("expected CoverProfile 'custom/coverage.out', got %q", cfg.CoverProfile)
	}
	if cfg.SummaryFile != "custom_summary.md" {
		t.Errorf("expected SummaryFile 'custom_summary.md', got %q", cfg.SummaryFile)
	}
	if cfg.FilterProfile == nil || *cfg.FilterProfile != false {
		t.Errorf("expected FilterProfile false, got %v", cfg.FilterProfile)
	}
	if len(cfg.Exclude) != 2 || cfg.Exclude[0] != "apis/**" || cfg.Exclude[1] != "tools/**" {
		t.Errorf("unexpected Exclude: %v", cfg.Exclude)
	}
}

func TestBadge(t *testing.T) {
	if badge(75.0) != "🟢" {
		t.Errorf("expected 🟢 for 75%%, got %s", badge(75.0))
	}
	if badge(55.0) != "🟡" {
		t.Errorf("expected 🟡 for 55%%, got %s", badge(55.0))
	}
	if badge(20.0) != "🔴" {
		t.Errorf("expected 🔴 for 20%%, got %s", badge(20.0))
	}
}
