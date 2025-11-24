package fieldmask

import (
	"fmt"
	"strings"
)

// Schema defines valid fields for a type
type Schema struct {
	name          string
	allowedFields map[string]FieldMetadata
	fieldsList    []string
}

// FieldMetadata contains metadata about a field
type FieldMetadata struct {
	Name        string
	Description string
	Required    bool
}

// SchemaBuilder helps construct a Schema
type SchemaBuilder struct {
	name   string
	fields []FieldMetadata
}

// NewSchema creates a new schema builder
func NewSchema(name string) *SchemaBuilder {
	return &SchemaBuilder{
		name:   name,
		fields: []FieldMetadata{},
	}
}

// Field adds a field to the schema
func (sb *SchemaBuilder) Field(name string, opts ...FieldOption) *SchemaBuilder {
	metadata := FieldMetadata{
		Name: name,
	}

	for _, opt := range opts {
		opt(&metadata)
	}

	sb.fields = append(sb.fields, metadata)
	return sb
}

// Build creates the final Schema
func (sb *SchemaBuilder) Build() *Schema {
	allowedFields := make(map[string]FieldMetadata, len(sb.fields))
	fieldsList := make([]string, 0, len(sb.fields))

	for _, field := range sb.fields {
		allowedFields[field.Name] = field
		fieldsList = append(fieldsList, field.Name)
	}

	return &Schema{
		name:          sb.name,
		allowedFields: allowedFields,
		fieldsList:    fieldsList,
	}
}

// FieldOption configures a field
type FieldOption func(*FieldMetadata)

// WithDescription adds a description to the field
func WithDescription(desc string) FieldOption {
	return func(fm *FieldMetadata) {
		fm.Description = desc
	}
}

// WithRequired marks a field as required
func WithRequired() FieldOption {
	return func(fm *FieldMetadata) {
		fm.Required = true
	}
}

// Validate validates a field mask against the schema
// If a field is not in the schema, validation fails
func (s *Schema) Validate(mask *FieldMask) error {
	if mask == nil || mask.IsEmpty() {
		return nil
	}

	var unknownFields []string

	for _, path := range mask.Paths() {
		if _, exists := s.allowedFields[path]; !exists {
			unknownFields = append(unknownFields, path)
		}
	}

	if len(unknownFields) > 0 {
		return fmt.Errorf("invalid field mask for %s: unknown fields: %s",
			s.name, strings.Join(unknownFields, ", "))
	}

	return nil
}

// Contains checks if a field is in the schema
func (s *Schema) Contains(fieldName string) bool {
	_, exists := s.allowedFields[fieldName]
	return exists
}

// Fields returns all valid field names
func (s *Schema) Fields() []string {
	result := make([]string, len(s.fieldsList))
	copy(result, s.fieldsList)
	return result
}

// FieldMetadata returns metadata for a field
func (s *Schema) FieldMetadata(fieldName string) (FieldMetadata, bool) {
	metadata, exists := s.allowedFields[fieldName]
	return metadata, exists
}

// Name returns the schema name
func (s *Schema) Name() string {
	return s.name
}
