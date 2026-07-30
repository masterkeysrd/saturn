package patch

import (
	"errors"
	"fmt"
)

var (
	// ErrNilEntity is returned when destination or source entity is nil.
	ErrNilEntity = errors.New("destination and source entities must not be nil")
	// ErrUnsupportedField is returned when a field specified in the mask is not registered in the schema.
	ErrUnsupportedField = errors.New("unsupported or unpatchable field")
)

// FieldCopier defines a function signature for copying a specific field from src to dst entity.
type FieldCopier[E any] func(dst, src *E) error

// Schema holds registered field copiers for entity type E.
type Schema[E any] struct {
	copiers map[string]FieldCopier[E]
}

// NewSchema initializes a new generic patch schema for entity E.
func NewSchema[E any]() *Schema[E] {
	return &Schema[E]{
		copiers: make(map[string]FieldCopier[E]),
	}
}

// Register registers a field copier for a given field path/name.
func (s *Schema[E]) Register(field string, copier FieldCopier[E]) *Schema[E] {
	s.copiers[field] = copier
	return s
}

// Apply copies fields specified in the mask from src to dst entity.
// If mask is empty or nil, all registered fields in the schema are applied (full update).
func (s *Schema[E]) Apply(dst, src *E, mask []string) error {
	if dst == nil || src == nil {
		return ErrNilEntity
	}

	fieldsToApply := mask
	if len(fieldsToApply) == 0 {
		fieldsToApply = make([]string, 0, len(s.copiers))
		for field := range s.copiers {
			fieldsToApply = append(fieldsToApply, field)
		}
	}

	for _, field := range fieldsToApply {
		copier, exists := s.copiers[field]
		if !exists {
			return fmt.Errorf("%w: %s", ErrUnsupportedField, field)
		}
		if err := copier(dst, src); err != nil {
			return fmt.Errorf("patch field %s: %w", field, err)
		}
	}
	return nil
}

// Field creates a FieldCopier using a pointer-to-field accessor func(*E) *V.
// Go automatically infers E and V without requiring explicit type parameters.
func Field[E any, V any](
	fieldAccess func(*E) *V,
	validate ...func(V) error,
) FieldCopier[E] {
	return func(dst, src *E) error {
		srcPtr := fieldAccess(src)
		dstPtr := fieldAccess(dst)

		if srcPtr == nil || dstPtr == nil {
			return ErrNilEntity
		}

		srcVal := *srcPtr
		for _, vFn := range validate {
			if err := vFn(srcVal); err != nil {
				return err
			}
		}

		*dstPtr = srcVal
		return nil
	}
}
