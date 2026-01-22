package fieldmask

import "strings"

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

// ReplacePath replaces an old path with a new path in the field mask
func (fm *FieldMask) ReplacePath(oldPath, newPath string) {
	if fm == nil {
		return
	}

	if _, exists := fm.pathsMask[oldPath]; !exists {
		return
	}

	// Update paths slice
	for i, path := range fm.paths {
		if path == oldPath {
			fm.paths[i] = newPath
		}
	}

	// Update pathsMask
	delete(fm.pathsMask, oldPath)
	fm.pathsMask[newPath] = struct{}{}
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
