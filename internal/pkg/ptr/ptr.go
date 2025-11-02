package ptr

func Of[T comparable](v T) *T {
	return &v
}

func Value[T comparable](p *T) T {
	if p == nil {
		var v T
		return v
	}

	return *p
}
