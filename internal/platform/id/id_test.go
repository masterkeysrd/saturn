package id

import (
	"strings"
	"testing"
)

func TestValidateMultiple(t *testing.T) {
	// Generate a valid ID with primary prefix "sctx_"
	raw, err := Generate("sctx_")
	if err != nil {
		t.Fatalf("Generate failed: %v", err)
	}

	// Test validation with correct prefixes
	if err := ValidateMultiple(raw, "sctx_", "sch_"); err != nil {
		t.Errorf("ValidateMultiple failed to validate correct primary prefix: %v", err)
	}

	// Generate a valid ID with legacy prefix "sch_"
	legacyRaw, err := Generate("sch_")
	if err != nil {
		t.Fatalf("Generate legacy failed: %v", err)
	}

	if err := ValidateMultiple(legacyRaw, "sctx_", "sch_"); err != nil {
		t.Errorf("ValidateMultiple failed to validate legacy prefix: %v", err)
	}

	// Test incorrect prefix
	if err := ValidateMultiple(raw, "rctx_", "rec_"); err == nil {
		t.Error("ValidateMultiple validated incorrect prefix, expected error")
	}

	// Test empty prefixes list
	if err := ValidateMultiple(raw); err == nil {
		t.Error("ValidateMultiple with no prefixes expected error, got nil")
	}
}

func TestPrefixGenerator(t *testing.T) {
	pg := NewPrefixGenerator("rctx_", "rec_")

	// Test Generation
	idStr, err := pg.Generate()
	if err != nil {
		t.Fatalf("PrefixGenerator.Generate failed: %v", err)
	}
	if !strings.HasPrefix(idStr, "rctx_") {
		t.Errorf("Expected generated ID to have prefix 'rctx_', got %s", idStr)
	}

	// Test Validation of primary
	if err := pg.Validate(idStr); err != nil {
		t.Errorf("PrefixGenerator.Validate failed to validate primary prefix: %v", err)
	}

	// Test Validation of legacy
	legacyIdStr, err := Generate("rec_")
	if err != nil {
		t.Fatalf("Generate legacy failed: %v", err)
	}
	if err := pg.Validate(legacyIdStr); err != nil {
		t.Errorf("PrefixGenerator.Validate failed to validate legacy prefix: %v", err)
	}

	// Test Validation failure
	invalidIdStr, err := Generate("sctx_")
	if err != nil {
		t.Fatalf("Generate other failed: %v", err)
	}
	if err := pg.Validate(invalidIdStr); err == nil {
		t.Error("PrefixGenerator.Validate expected validation error for mismatched prefix, got nil")
	}
}
