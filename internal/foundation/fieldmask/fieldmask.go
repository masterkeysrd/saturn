package fieldmask

import (
	"slices"
	"strings"
)

type FieldMask struct {
	paths     []string            // To keep the order
	pathsMask map[string]struct{} // fast lookup
}

// NewFieldMask creates a new field mask from paths
func NewFieldMask(paths ...string) *FieldMask {
	return newFieldMask(paths)
}

func FromString(paths string, sep string) *FieldMask {
	pathsSlice := strings.Split(paths, sep)
	return newFieldMask(pathsSlice)
}

func newFieldMask(paths []string) *FieldMask {
	if len(paths) == 0 {
		return &FieldMask{
			paths:     []string{},
			pathsMask: make(map[string]struct{}),
		}
	}

	pathsMask := make(map[string]struct{}, len(paths))
	for _, path := range paths {
		path = strings.TrimSpace(path)
		if path != "" {
			pathsMask[path] = struct{}{}
		}
	}

	return &FieldMask{
		paths:     paths,
		pathsMask: pathsMask,
	}
}

// Contains checks if a field path is in the mask
func (fm *FieldMask) Contains(path string) bool {
	if fm == nil || len(fm.pathsMask) == 0 {
		return true // Empty mask means all fields
	}
	_, exists := fm.pathsMask[path]
	return exists
}

// ContainsPrefix checks if any field path with the given prefix is in the mask
func (fm *FieldMask) ContainsPrefix(prefix string) bool {
	if fm == nil || len(fm.pathsMask) == 0 {
		return true // Empty mask means all fields
	}

	for path := range fm.pathsMask {
		if strings.HasPrefix(path, prefix) {
			return true
		}
	}

	return false
}

// IsEmpty returns true if no fields are masked
func (fm *FieldMask) IsEmpty() bool {
	return fm == nil || len(fm.paths) == 0
}

// Paths returns a copy of all field paths
func (fm *FieldMask) Paths() []string {
	if fm == nil {
		return nil
	}
	// Return copy to prevent mutation
	result := make([]string, len(fm.paths))
	copy(result, fm.paths)
	return result
}

func (fm *FieldMask) ColapsePrefix(prefix string) {
	if fm == nil || len(fm.pathsMask) == 0 {
		return
	}

	prefixWithDot := prefix + "."

	newPaths := make([]string, 0, len(fm.paths))
	foundPrefix := false

	for _, path := range fm.paths {
		if path == prefix || strings.HasPrefix(path, prefixWithDot) {
			foundPrefix = true
			continue
		}
		newPaths = append(newPaths, path)
	}

	if !foundPrefix {
		return
	}

	fm.paths = slices.Clip(append(newPaths, prefix))
	fm.pathsMask = make(map[string]struct{}, len(fm.paths))
	for _, path := range fm.paths {
		fm.pathsMask[path] = struct{}{}
	}
}

// String returns a comma-separated string of paths
func (fm *FieldMask) String() string {
	if fm == nil || len(fm.paths) == 0 {
		return ""
	}
	return strings.Join(fm.paths, ",")
}

func (fm *FieldMask) Len() int {
	if fm == nil {
		return 0
	}

	return len(fm.paths)
}

func (fm *FieldMask) MarshalText() ([]byte, error) {
	return []byte(fm.String()), nil
}

func (fm *FieldMask) UnmarshalText(data []byte) error {
	fmNew := FromString(string(data), ",")
	fm.paths = fmNew.paths
	fm.pathsMask = fmNew.pathsMask
	return nil
}
