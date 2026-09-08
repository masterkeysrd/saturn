package errors_test

import (
	"errors"
	"fmt"
	"reflect"
	"testing"

	platErr "github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestE_Constructor(t *testing.T) {
	t.Run("nil on empty args", func(t *testing.T) {
		if err := platErr.E(); err != nil {
			t.Fatalf("expected nil, got %v", err)
		}
	})

	t.Run("populates fields correctly", func(t *testing.T) {
		const op platErr.Op = "finance.InvertStatementSigns"
		const kind = platErr.Precondition
		const code platErr.Code = "STATEMENT_COMPLETED"
		meta := platErr.Meta{"statement_id": "stmt_123"}
		violation := platErr.FieldViolation{Field: "status", Description: "already completed"}

		err := platErr.E(op, kind, code, meta, violation, "cannot modify completed statement")
		if err == nil {
			t.Fatal("expected non-nil error")
		}

		if got := platErr.KindOf(err); got != kind {
			t.Errorf("expected kind %v, got %v", kind, got)
		}
		if got := platErr.CodeOf(err); got != code {
			t.Errorf("expected code %v, got %v", code, got)
		}

		gotMeta := platErr.MetaOf(err)
		if gotMeta["statement_id"] != "stmt_123" {
			t.Errorf("expected meta statement_id to be stmt_123, got %v", gotMeta["statement_id"])
		}

		details := platErr.DetailsOf(err)
		if len(details) != 1 {
			t.Fatalf("expected 1 detail, got %d", len(details))
		}
		if v, ok := details[0].(platErr.FieldViolation); !ok || v.Field != "status" {
			t.Errorf("expected FieldViolation with field 'status', got %v", details[0])
		}
	})

	t.Run("supports FieldViolations collection and arbitrary details", func(t *testing.T) {
		violations := platErr.FieldViolations{
			{Field: "amount", Description: "must be positive"},
			{Field: "currency", Description: "must be 3 letters"},
		}
		customDetail := struct{ TraceID string }{"trace-123"}
		err := platErr.E(violations, customDetail, nil)
		details := platErr.DetailsOf(err)
		if len(details) != 2 {
			t.Fatalf("expected 2 details, got %d", len(details))
		}
	})

	t.Run("canonical field lifting from inner error", func(t *testing.T) {
		inner := platErr.E(
			platErr.Op("store.Get"),
			platErr.NotExist,
			platErr.Code("NOT_FOUND"),
			"record not found",
		)

		// Outer error has no Kind or Code; it should lift from inner
		outer := platErr.E(platErr.Op("service.Find"), inner)

		if got := platErr.KindOf(outer); got != platErr.NotExist {
			t.Errorf("expected lifted kind %v, got %v", platErr.NotExist, got)
		}
		if got := platErr.CodeOf(outer); got != platErr.Code("NOT_FOUND") {
			t.Errorf("expected lifted code NOT_FOUND, got %v", got)
		}

		// Inner error should have had Kind and Code zeroed to prevent duplicate printing in trace
		eOuter, ok := outer.(*platErr.Error)
		if !ok {
			t.Fatalf("expected *platErr.Error, got %T", outer)
		}
		eInner, ok := eOuter.Err.(*platErr.Error)
		if !ok {
			t.Fatalf("expected inner *platErr.Error, got %T", eOuter.Err)
		}
		if eInner.Kind != 0 {
			t.Errorf("expected inner kind to be 0 after lifting, got %v", eInner.Kind)
		}
		if eInner.Code != "" {
			t.Errorf("expected inner code to be empty after lifting, got %v", eInner.Code)
		}
	})

	t.Run("outer kind overrides inner kind", func(t *testing.T) {
		inner := platErr.E(platErr.Op("store.Get"), platErr.NotExist, "not found")
		outer := platErr.E(platErr.Op("service.Find"), platErr.Internal, inner)

		if got := platErr.KindOf(outer); got != platErr.Internal {
			t.Errorf("expected outer kind Internal, got %v", got)
		}
	})
}

func TestError_Format(t *testing.T) {
	t.Run("single layer error", func(t *testing.T) {
		err := platErr.E(
			platErr.Op("finance.CreateAccount"),
			platErr.Invalid,
			platErr.Code("ACCOUNT_NAME_REQUIRED"),
			"account name is empty",
		)
		expected := "finance.CreateAccount: invalid: ACCOUNT_NAME_REQUIRED: account name is empty"
		if err.Error() != expected {
			t.Errorf("\nexpected: %s\ngot:      %s", expected, err.Error())
		}
	})

	t.Run("multi-layer trace with field lifting", func(t *testing.T) {
		storeErr := platErr.E(
			platErr.Op("statement_store.UpdateStatement"),
			platErr.Conflict,
			platErr.Code("VERSION_MISMATCH"),
			"optimistic lock failed",
		)
		svcErr := platErr.E(platErr.Op("finance.InvertStatementSigns"), storeErr)

		expected := "finance.InvertStatementSigns: conflict: VERSION_MISMATCH: statement_store.UpdateStatement: optimistic lock failed"
		if svcErr.Error() != expected {
			t.Errorf("\nexpected: %s\ngot:      %s", expected, svcErr.Error())
		}
	})

	t.Run("empty error", func(t *testing.T) {
		e := &platErr.Error{}
		if e.Error() != "empty error" {
			t.Errorf("expected 'empty error', got %q", e.Error())
		}
	})
}

func TestError_UnwrapAndIs(t *testing.T) {
	root := errors.New("underlying root error")
	err := platErr.E(platErr.Op("service.Execute"), platErr.Internal, root)

	if !errors.Is(err, root) {
		t.Error("expected errors.Is to find root error through Unwrap")
	}

	template := platErr.E(platErr.Internal)
	if !errors.Is(err, template) {
		t.Error("expected errors.Is to match template with KindInternal")
	}

	diffTemplate := platErr.E(platErr.NotExist)
	if errors.Is(err, diffTemplate) {
		t.Error("expected errors.Is NOT to match template with KindNotExist")
	}
}

func TestPackage_Is(t *testing.T) {
	err := platErr.E(platErr.Op("service.Execute"), platErr.Permission, "forbidden")

	if !platErr.Is(platErr.Permission, err) {
		t.Error("expected platErr.Is(Permission, err) to be true")
	}
	if platErr.Is(platErr.NotExist, err) {
		t.Error("expected platErr.Is(NotExist, err) to be false")
	}
}

func TestUserMessage(t *testing.T) {
	t.Run("domain error with clean text message", func(t *testing.T) {
		err := platErr.E(
			platErr.Op("finance.InvertStatementSigns"),
			platErr.Precondition,
			platErr.Code("STATEMENT_COMPLETED"),
			"statement has already been completed",
		)
		msg := platErr.UserMessage(err)
		expected := "statement has already been completed"
		if msg != expected {
			t.Errorf("expected user message %q, got %q", expected, msg)
		}
	})

	t.Run("internal error is redacted", func(t *testing.T) {
		dbErr := fmt.Errorf("pq: connection to localhost:5432 failed: password authentication failed for user 'saturn'")
		err := platErr.E(platErr.Op("finance.Save"), platErr.Internal, dbErr)

		msg := platErr.UserMessage(err)
		expected := "An unexpected internal error occurred. Please try again later."
		if msg != expected {
			t.Errorf("expected redacted message %q, got %q", expected, msg)
		}
	})

	t.Run("nil error returns empty string", func(t *testing.T) {
		if msg := platErr.UserMessage(nil); msg != "" {
			t.Errorf("expected empty string, got %q", msg)
		}
	})
}

func TestMatch(t *testing.T) {
	err1 := platErr.E(platErr.Op("finance.Invert"), platErr.Precondition, platErr.Code("STATEMENT_COMPLETED"))
	err2 := platErr.E(platErr.Op("finance.Invert"), platErr.Precondition, platErr.Code("STATEMENT_COMPLETED"), "some detail")

	if !platErr.Match(err1, err2) {
		t.Error("expected err1 to match err2 when template fields match")
	}

	tmplDiffKind := platErr.E(platErr.NotExist)
	if platErr.Match(tmplDiffKind, err2) {
		t.Error("expected Match to fail when Kind differs")
	}

	tmplDiffCode := platErr.E(platErr.Code("DIFFERENT_CODE"))
	if platErr.Match(tmplDiffCode, err2) {
		t.Error("expected Match to fail when Code differs")
	}
}

func TestMetaAndDetails(t *testing.T) {
	err1 := platErr.E(
		platErr.Meta{"key1": "val1", "shared": "leaf"},
		platErr.FieldViolation{Field: "f1", Description: "d1"},
		"leaf message",
	)
	err2 := platErr.E(
		platErr.Meta{"key2": "val2", "shared": "outer"},
		platErr.FieldViolation{Field: "f2", Description: "d2"},
		err1,
	)

	meta := platErr.MetaOf(err2)
	if meta["key1"] != "val1" || meta["key2"] != "val2" {
		t.Errorf("unexpected meta keys: %v", meta)
	}
	// Outer meta should take precedence or leaf? MetaOf preserves outer since outer is checked first.
	if meta["shared"] != "outer" {
		t.Errorf("expected outer meta 'outer' to take precedence, got %v", meta["shared"])
	}

	details := platErr.DetailsOf(err2)
	if len(details) != 2 {
		t.Fatalf("expected 2 details collected, got %d", len(details))
	}

	expectedDetails := []any{
		platErr.FieldViolation{Field: "f2", Description: "d2"},
		platErr.FieldViolation{Field: "f1", Description: "d1"},
	}
	if !reflect.DeepEqual(details, expectedDetails) {
		t.Errorf("details mismatch:\nexpected: %v\ngot:      %v", expectedDetails, details)
	}
}

func TestKind_String(t *testing.T) {
	kinds := []struct {
		kind platErr.Kind
		want string
	}{
		{platErr.Other, "other"},
		{platErr.Invalid, "invalid"},
		{platErr.Permission, "permission_denied"},
		{platErr.Unauthenticated, "unauthenticated"},
		{platErr.NotExist, "not_found"},
		{platErr.Exist, "already_exists"},
		{platErr.Conflict, "conflict"},
		{platErr.Precondition, "failed_precondition"},
		{platErr.ResourceExhausted, "resource_exhausted"},
		{platErr.Internal, "internal"},
		{platErr.Unavailable, "unavailable"},
		{platErr.Kind(99), "other"},
	}

	for _, tt := range kinds {
		if got := tt.kind.String(); got != tt.want {
			t.Errorf("Kind(%d).String() = %q; want %q", tt.kind, got, tt.want)
		}
	}
}

func TestKindOf_And_CodeOf_EdgeCases(t *testing.T) {
	if got := platErr.KindOf(nil); got != 0 {
		t.Errorf("expected 0 for nil, got %v", got)
	}
	if got := platErr.CodeOf(nil); got != "" {
		t.Errorf("expected empty for nil, got %q", got)
	}

	stdErr := errors.New("standard error")
	if got := platErr.KindOf(stdErr); got != platErr.Other {
		t.Errorf("expected Other for std error, got %v", got)
	}
	if got := platErr.CodeOf(stdErr); got != "" {
		t.Errorf("expected empty code for std error, got %q", got)
	}

	chainWithoutKind := platErr.E(platErr.Op("op1"), platErr.E(platErr.Op("op2"), "some error"))
	if got := platErr.KindOf(chainWithoutKind); got != platErr.Other {
		t.Errorf("expected Other when no kind in chain, got %v", got)
	}
	if got := platErr.CodeOf(chainWithoutKind); got != "" {
		t.Errorf("expected empty code when no code in chain, got %q", got)
	}
}

func TestUserMessage_Fallbacks(t *testing.T) {
	t.Run("only code present", func(t *testing.T) {
		err := platErr.E(platErr.Code("CODE_ONLY"))
		if got := platErr.UserMessage(err); got != "CODE_ONLY" {
			t.Errorf("expected 'CODE_ONLY', got %q", got)
		}
	})

	t.Run("only kind present", func(t *testing.T) {
		err := platErr.E(platErr.Invalid)
		if got := platErr.UserMessage(err); got != "invalid" {
			t.Errorf("expected 'invalid', got %q", got)
		}
	})

	t.Run("empty error fallback", func(t *testing.T) {
		err := &platErr.Error{}
		if got := platErr.UserMessage(err); got != "an error occurred" {
			t.Errorf("expected 'an error occurred', got %q", got)
		}
	})

	t.Run("standard error unwrapped", func(t *testing.T) {
		std := errors.New("plain error")
		if got := platErr.UserMessage(std); got != "plain error" {
			t.Errorf("expected 'plain error', got %q", got)
		}
	})
}

func TestMatch_EdgeCases(t *testing.T) {
	if !platErr.Match(nil, nil) {
		t.Error("expected Match(nil, nil) to be true")
	}
	if platErr.Match(nil, errors.New("err")) {
		t.Error("expected Match(nil, non-nil) to be false")
	}
	if platErr.Match(errors.New("err"), nil) {
		t.Error("expected Match(non-nil, nil) to be false")
	}

	std1 := errors.New("std err")
	std2 := errors.New("std err")
	std3 := errors.New("different")
	if !platErr.Match(std1, std2) {
		t.Error("expected Match on equal standard errors to be true")
	}
	if platErr.Match(std1, std3) {
		t.Error("expected Match on different standard errors to be false")
	}

	platErrInstance := platErr.E(platErr.Op("test"), "msg")
	if platErr.Match(platErrInstance, std1) {
		t.Error("expected *Error template against standard error to not match unless exact Error() string")
	}

	tmplOpMismatch := platErr.E(platErr.Op("opA"))
	errOpMismatch := platErr.E(platErr.Op("opB"))
	if platErr.Match(tmplOpMismatch, errOpMismatch) {
		t.Error("expected Match to fail when Op differs")
	}

	rootA := errors.New("root A")
	rootB := errors.New("root B")
	tmplNested := platErr.E(platErr.Op("op"), rootA)
	errNestedSame := platErr.E(platErr.Op("op"), rootA)
	errNestedDiff := platErr.E(platErr.Op("op"), rootB)
	errNestedNil := platErr.E(platErr.Op("op"))

	if !platErr.Match(tmplNested, errNestedSame) {
		t.Error("expected nested match with same root to succeed")
	}
	if platErr.Match(tmplNested, errNestedDiff) {
		t.Error("expected nested match with different root to fail")
	}
	if platErr.Match(tmplNested, errNestedNil) {
		t.Error("expected nested match with nil root in err to fail")
	}
}

func TestNew_And_As(t *testing.T) {
	err := platErr.New("custom simple error")
	if err == nil || err.Error() != "custom simple error" {
		t.Errorf("unexpected New error: %v", err)
	}

	var target *platErr.Error
	if !platErr.As(err, &target) {
		t.Fatal("expected As to find *platErr.Error")
	}
	if target.Error() != "custom simple error" {
		t.Errorf("unexpected target error: %v", target)
	}

	// Test bidirectional Is:
	kindErr := platErr.E(platErr.Invalid, "invalid payload")
	if !platErr.Is(kindErr, platErr.Invalid) {
		t.Error("expected Is(err, Kind) to be true")
	}
	if !platErr.Is(platErr.Invalid, kindErr) {
		t.Error("expected Is(Kind, err) to be true")
	}
	if !platErr.Is(kindErr, kindErr) {
		t.Error("expected Is(err, targetErr) to be true")
	}

	codeErr := platErr.E(platErr.Code("NOT_FOUND"), "item not found")
	if !platErr.Is(codeErr, platErr.Code("NOT_FOUND")) {
		t.Error("expected Is(err, Code) to be true")
	}
	if !platErr.Is(platErr.Code("NOT_FOUND"), codeErr) {
		t.Error("expected Is(Code, err) to be true")
	}
	if platErr.Is(codeErr, platErr.Code("OTHER")) {
		t.Error("expected Is(err, different Code) to be false")
	}
}
