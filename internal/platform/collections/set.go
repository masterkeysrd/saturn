package collections

// Set represents a generic, type-safe set structure using Go's map[T]struct{}.
type Set[T comparable] map[T]struct{}

// NewSet instantiates a new Set containing the provided items.
func NewSet[T comparable](items ...T) Set[T] {
	s := make(Set[T])
	for _, item := range items {
		s[item] = struct{}{}
	}
	return s
}

// Add inserts items into the set.
func (s Set[T]) Add(items ...T) {
	for _, item := range items {
		s[item] = struct{}{}
	}
}

// Contains checks if an item exists in the set.
func (s Set[T]) Contains(item T) bool {
	_, ok := s[item]
	return ok
}

// ToSlice converts the set back into a slice.
func (s Set[T]) ToSlice() []T {
	slice := make([]T, 0, len(s))
	for item := range s {
		slice = append(slice, item)
	}
	return slice
}
