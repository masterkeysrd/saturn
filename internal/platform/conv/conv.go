package conv

// String converts a string-ish type to a standard string.
func String[T ~string](v T) string {
	return string(v)
}

// StringPtr converts a pointer to a string-ish type to a pointer to a standard string.
// If the input pointer is nil, nil is returned.
func StringPtr[T ~string](p *T) *string {
	if p == nil {
		return nil
	}
	s := string(*p)
	return &s
}

// Value returns the value pointed to by p, or the zero value of T if p is nil.
func Value[T any](p *T) T {
	if p == nil {
		var zero T
		return zero
	}
	return *p
}
