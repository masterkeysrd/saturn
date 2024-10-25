package errors

import (
	"bytes"
	"fmt"
	"runtime"
)

type Error struct {
	// Op is the operation being performed, usually the name of the method being
	// called.
	Op Op

	// Kind is the class of error, such as bad input, database problem, etc.
	Kind Kind

	// Err is the underlying error that triggered this one, if any.
	Err error
}

func (e *Error) isZero() bool {
	return e.Op == "" && e.Kind == 0 && e.Err == nil
}

// Op describes an operation, usually as the package and method, such as
// "expense.service.Create".
type Op string

// Separator is the string used to separate nested errors.
const Separator = ":\n\t"

// Kind describes the class of error, such as bad input, database problem, etc.
type Kind uint8

// Kind of errors.
const (
	Other      Kind = iota // Unclassified error.
	Invalid                // Invalid operation for this type of item.
	Permission             // Permission denied.
	IO                     // External I/O error such as network failure.
	Storage                // Storage failure.
	Exist                  // Item already exists.
	NotExist               // Item does not exist.
	Internal               // Internal error.
)

func (k Kind) String() string {
	switch k {
	case Other:
		return "other error"
	case Invalid:
		return "invalid operation"
	case Permission:
		return "permission denied"
	case IO:
		return "I/O error"
	case Storage:
		return "storage error"
	case Exist:
		return "item already exists"
	case NotExist:
		return "item does not exist"
	case Internal:
		return "internal error"
	}

	return "unknown error kind"
}

// New builds an error from the given arguments.
// There must be at least one argument or New will panic.
// The type of each argument determines its meaning.
// If there is more than one argument of a given type is presented,
// only the last one will be used.
//
// The types of arguments are:
//
//		errors.Op
//	   The operation being performed, usually the name of the method being
//	   invoked.
//		string:
//	   Treated as an error message and assigned to the Err field after a call
//	   to errors.Str. Use errors.Str when only want to create an error with
//	   a message.
//		errors.Kind:
//	   The class of error, such as bad input, database problem, etc.
//	 error:
//	   The underlying error that triggered this one, if any.
func New(args ...interface{}) error {
	if len(args) == 0 {
		panic("call to errors.New with no arguments")
	}

	e := &Error{}
	for _, arg := range args {
		switch arg := arg.(type) {
		case Op:
			e.Op = arg
		case string:
			e.Err = Str(arg)
		case Kind:
			e.Kind = arg
		case *Error:
			// Make a copy of the error.
			c := *arg
			e.Err = &c
		case error:
			e.Err = arg
		default:
			_, file, line, _ := runtime.Caller(1)
			return Errorf("unknown type %T, value %v at %s:%d", arg, arg, file, line)
		}
	}

	prev, ok := e.Err.(*Error)
	if !ok {
		return e
	}

	if prev.Kind == e.Kind {
		prev.Kind = Other

	}

	// If this error has Kind unset or Other, pull up the inner one.
	if e.Kind == Other {
		e.Kind = prev.Kind
		prev.Kind = Other
	}

	return e
}

func pad(b *bytes.Buffer, s string) {
	if b.Len() > 0 {
		b.WriteString(s)
	}
}

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

	if e.Err != nil {
		fmt.Println("error is not nil", e.Err)
		// Indent on new if we cascading non-error messages.
		if prevErr, ok := e.Err.(*Error); ok && prevErr.Err != nil {
			if !prevErr.isZero() {
				b.WriteString(Separator)
			}
			b.WriteString(prevErr.Error())
		} else {
			pad(b, ": ")
			b.WriteString(e.Err.Error())
		}
	}

	if b.Len() == 0 {
		return "no error"
	}

	return b.String()
}

func Str(text string) error {
	return &errorString{text}
}

type errorString struct {
	s string
}

func (e *errorString) Error() string {
	return e.s
}

func Errorf(format string, args ...interface{}) error {
	return &errorString{fmt.Sprintf(format, args...)}
}

// Is reports whether err is an *Error of the given Kind.
// If err is nil, Is returns false.
func Is(err error, kind Kind) bool {
	e, ok := err.(*Error)
	if !ok {
		return false
	}

	if e.Kind != Other {
		return e.Kind == kind
	}

	if e.Err != nil {
		return Is(e.Err, kind)
	}

	return false
}
