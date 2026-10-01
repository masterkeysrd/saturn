package finance_test

import (
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/finance"
)

func TestSimpleContext(t *testing.T) {
	loc, err := time.LoadLocation("America/Santo_Domingo")
	if err != nil {
		t.Fatalf("load location: %v", err)
	}

	ctx := finance.NewContext("spc_123", "usr_456", loc, "DOP")

	if ctx.SpaceID() != "spc_123" {
		t.Errorf("expected SpaceID spc_123, got %s", ctx.SpaceID())
	}
	if ctx.UserID() != "usr_456" {
		t.Errorf("expected UserID usr_456, got %s", ctx.UserID())
	}
	if ctx.BaseCurrency() != "DOP" {
		t.Errorf("expected BaseCurrency DOP, got %s", ctx.BaseCurrency())
	}
	if ctx.Location() != loc {
		t.Errorf("expected location %v, got %v", loc, ctx.Location())
	}

	now := ctx.Now()
	if now.Location() != loc {
		t.Errorf("expected Now() to be in loc %v, got %v", loc, now.Location())
	}

	zeroDate := ctx.Date(time.Time{})
	if zeroDate.IsZero() || zeroDate.Location() != loc {
		t.Errorf("expected Date(zero) to return Now() in loc %v", loc)
	}

	utcTime := time.Date(2026, 10, 1, 2, 0, 0, 0, time.UTC)
	localized := ctx.Date(utcTime)
	if localized.Location() != loc {
		t.Errorf("expected localized to be in loc %v", loc)
	}
	if localized.Day() != 30 || localized.Month() != time.September {
		t.Errorf("expected localized to be Sept 30 in AST, got %v", localized)
	}

	// Nil loc defaults to UTC
	defaultCtx := finance.NewContext("spc_1", "usr_1", nil, "USD")
	if defaultCtx.Location() != time.UTC {
		t.Errorf("expected default loc to be UTC, got %v", defaultCtx.Location())
	}
}
