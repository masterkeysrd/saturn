package errors

import (
	"bytes"
	"errors"
	"maps"
)

// Op describes an operation, typically "package.Function" or "type.Method".
type Op string

// Kind defines the canonical classification of an error.
type Kind uint8

const (
	Other Kind = iota
	Invalid
	Permission
	Unauthenticated
	NotExist
	Exist
	Conflict
	Precondition
	ResourceExhausted
	Internal
	Unavailable
)

func (k Kind) String() string {
	switch k {
	case Invalid:
		return "invalid"
	case Permission:
		return "permission_denied"
	case Unauthenticated:
		return "unauthenticated"
	case NotExist:
		return "not_found"
	case Exist:
		return "already_exists"
	case Conflict:
		return "conflict"
	case Precondition:
		return "failed_precondition"
	case ResourceExhausted:
		return "resource_exhausted"
	case Internal:
		return "internal"
	case Unavailable:
		return "unavailable"
	default:
		return "other"
	}
}

// Code represents a stable, machine-readable error code string (e.g. "STATEMENT_COMPLETED").
type Code string

// Meta holds arbitrary diagnostic key-value context (e.g. space_id, account_id).
type Meta map[string]any

// FieldViolation represents a validation failure on a specific input field.
type FieldViolation struct {
	Field       string `json:"field"`
	Description string `json:"description"`
}

// FieldViolations is a collection of FieldViolation.
type FieldViolations []FieldViolation

// Error is the concrete Upspin-style error representation.
type Error struct {
	Op      Op
	Kind    Kind
	Code    Code
	Meta    Meta
	Details []any
	Err     error
}

// pad appends str to the buffer if the buffer is not empty.
func pad(b *bytes.Buffer, str string) {
	if b.Len() == 0 {
		return
	}
	b.WriteString(str)
}

// Error formats the error into an operational trace.
func (e *Error) Error() string {
	b := new(bytes.Buffer)
	if e.Op != "" {
		pad(b, ": ")
		b.WriteString(string(e.Op))
	}
	if e.Kind != 0 {
		pad(b, ": ")
		b.WriteString(e.Kind.String())
	}
	if e.Code != "" {
		pad(b, ": ")
		b.WriteString(string(e.Code))
	}
	if e.Err != nil {
		pad(b, ": ")
		b.WriteString(e.Err.Error())
	}
	if b.Len() == 0 {
		return "empty error"
	}
	return b.String()
}

// Unwrap returns the underlying error for standard library errors.Unwrap support.
func (e *Error) Unwrap() error {
	return e.Err
}

// Is implements the standard library errors.Is interface.
func (e *Error) Is(target error) bool {
	if t, ok := target.(*Error); ok {
		return Match(t, e)
	}
	return false
}

// E constructs an Error from its arguments.
// The type of each argument determines its meaning:
//   - Op: sets e.Op
//   - Kind: sets e.Kind
//   - Code: sets e.Code
//   - Meta: merges into e.Meta
//   - string: converted to an error via errors.New
//   - *Error: sets e.Err
//   - error: sets e.Err
//   - FieldViolation, FieldViolations, or any: appended to e.Details
func E(args ...any) error {
	if len(args) == 0 {
		return nil
	}
	e := &Error{}
	for _, arg := range args {
		switch arg := arg.(type) {
		case Op:
			e.Op = arg
		case Kind:
			e.Kind = arg
		case Code:
			e.Code = arg
		case Meta:
			if e.Meta == nil {
				e.Meta = make(Meta)
			}
			maps.Copy(e.Meta, arg)
		case *Error:
			// Copy so we don't mutate original
			copyErr := *arg
			e.Err = &copyErr
		case error:
			e.Err = arg
		case string:
			e.Err = errors.New(arg)
		case FieldViolation:
			e.Details = append(e.Details, arg)
		case FieldViolations:
			e.Details = append(e.Details, arg)
		default:
			if arg != nil {
				e.Details = append(e.Details, arg)
			}
		}
	}

	// Canonical field lifting: if top error has no Kind or Code, lift from inner *Error
	if prev, ok := e.Err.(*Error); ok {
		if e.Kind == 0 {
			e.Kind = prev.Kind
			prev.Kind = 0
		}
		if e.Code == "" {
			e.Code = prev.Code
			prev.Code = ""
		}
	}

	return e
}

// KindOf returns the canonical Kind of err, searching down the error chain.
// If no Kind is found, it defaults to Other.
func KindOf(err error) Kind {
	if err == nil {
		return 0
	}
	for err != nil {
		if e, ok := err.(*Error); ok {
			if e.Kind != 0 {
				return e.Kind
			}
			err = e.Err
		} else {
			break
		}
	}
	return Other
}

// CodeOf returns the Code of err, searching down the error chain.
func CodeOf(err error) Code {
	if err == nil {
		return ""
	}
	for err != nil {
		if e, ok := err.(*Error); ok {
			if e.Code != "" {
				return e.Code
			}
			err = e.Err
		} else {
			break
		}
	}
	return ""
}

// MetaOf collects all metadata across the error chain into a single map.
func MetaOf(err error) Meta {
	meta := make(Meta)
	for err != nil {
		if e, ok := err.(*Error); ok {
			for k, v := range e.Meta {
				if _, exists := meta[k]; !exists {
					meta[k] = v
				}
			}
			err = e.Err
		} else {
			break
		}
	}
	return meta
}

// DetailsOf collects all dynamic details attached across the error chain.
func DetailsOf(err error) []any {
	var details []any
	for err != nil {
		if e, ok := err.(*Error); ok {
			if len(e.Details) > 0 {
				details = append(details, e.Details...)
			}
			err = e.Err
		} else {
			break
		}
	}
	return details
}

// New returns an error that formats as the given text.
func New(text string) error {
	return E(text)
}

// As finds the first error in err's tree that matches target, and if one is found, sets
// target to that error value and returns true.
func As(err error, target any) bool {
	return errors.As(err, target)
}

// Is reports whether err matches target (either a Kind or an error).
// It supports standard (err, target) as well as (kind, err) invocation.
func Is(arg1 any, arg2 any) bool {
	if k, ok := arg1.(Kind); ok {
		if err, ok := arg2.(error); ok {
			return KindOf(err) == k
		}
	}
	if err, ok := arg1.(error); ok {
		if k, ok := arg2.(Kind); ok {
			return KindOf(err) == k
		}
		if target, ok := arg2.(error); ok {
			return errors.Is(err, target)
		}
	}
	return false
}

// UserMessage extracts a user-facing error message from err.
// It traverses down to the root cause message, stripping operational prefixes.
// If the error is of KindInternal, it returns a safe, sanitized generic message.
func UserMessage(err error) string {
	if err == nil {
		return ""
	}
	if KindOf(err) == Internal {
		return "An unexpected internal error occurred. Please try again later."
	}

	var curr = err
	for {
		if e, ok := curr.(*Error); ok {
			if e.Err != nil {
				curr = e.Err
				continue
			}
			if e.Code != "" {
				return string(e.Code)
			}
			if e.Kind != 0 {
				return e.Kind.String()
			}
			return "an error occurred"
		}
		return curr.Error()
	}
}

// Match reports whether err matches template.
// Only non-zero fields in template are matched against err.
func Match(template, err error) bool {
	if template == nil {
		return err == nil
	}
	if err == nil {
		return false
	}
	e, ok := err.(*Error)
	if !ok {
		return template.Error() == err.Error()
	}
	t, ok := template.(*Error)
	if !ok {
		return template.Error() == err.Error()
	}
	if t.Op != "" && t.Op != e.Op {
		return false
	}
	if t.Kind != 0 && t.Kind != KindOf(e) {
		return false
	}
	if t.Code != "" && t.Code != CodeOf(e) {
		return false
	}
	if t.Err != nil {
		if e.Err == nil {
			return false
		}
		if t.Err.Error() != e.Err.Error() && !Match(t.Err, e.Err) {
			return false
		}
	}
	return true
}
