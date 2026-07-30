package patch_test

import (
	"errors"
	"testing"

	"github.com/masterkeysrd/saturn/internal/platform/patch"
)

type TestEntity struct {
	ID          string
	Name        string
	Description string
	Age         int
}

func TestPatchEngine_Apply(t *testing.T) {
	errEmptyName := errors.New("name cannot be empty")

	schema := patch.NewSchema[TestEntity]().
		Register("name", patch.Field(
			func(e *TestEntity) *string { return &e.Name },
			func(v string) error {
				if v == "" {
					return errEmptyName
				}
				return nil
			},
		)).
		Register("description", patch.Field(
			func(e *TestEntity) *string { return &e.Description },
		)).
		Register("age", patch.Field(
			func(e *TestEntity) *int { return &e.Age },
		))

	t.Run("successfully patches specified fields only", func(t *testing.T) {
		dst := &TestEntity{ID: "1", Name: "Original Name", Description: "Original Desc", Age: 20}
		src := &TestEntity{ID: "99", Name: "New Name", Description: "New Desc", Age: 30}

		mask := []string{"name", "age"}
		err := schema.Apply(dst, src, mask)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if dst.Name != "New Name" {
			t.Errorf("expected Name 'New Name', got '%s'", dst.Name)
		}
		if dst.Age != 30 {
			t.Errorf("expected Age 30, got %d", dst.Age)
		}
		if dst.Description != "Original Desc" {
			t.Errorf("expected Description to remain 'Original Desc', got '%s'", dst.Description)
		}
		if dst.ID != "1" {
			t.Errorf("expected ID to remain '1', got '%s'", dst.ID)
		}
	})

	t.Run("successfully patches all fields when mask is empty or nil", func(t *testing.T) {
		dst := &TestEntity{ID: "1", Name: "Original Name", Description: "Original Desc", Age: 20}
		src := &TestEntity{ID: "99", Name: "New Name", Description: "New Desc", Age: 30}

		err := schema.Apply(dst, src, nil)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}

		if dst.Name != "New Name" || dst.Description != "New Desc" || dst.Age != 30 {
			t.Errorf("expected all fields updated, got Name='%s', Desc='%s', Age=%d", dst.Name, dst.Description, dst.Age)
		}
	})

	t.Run("returns error on unsupported field in mask", func(t *testing.T) {
		dst := &TestEntity{ID: "1", Name: "Original"}
		src := &TestEntity{ID: "1", Name: "New"}

		mask := []string{"unregistered_field"}
		err := schema.Apply(dst, src, mask)
		if err == nil {
			t.Fatal("expected error for unregistered field, got nil")
		}
		if !errors.Is(err, patch.ErrUnsupportedField) {
			t.Errorf("expected ErrUnsupportedField, got %v", err)
		}
	})

	t.Run("runs field-level validation rules", func(t *testing.T) {
		dst := &TestEntity{Name: "Original"}
		src := &TestEntity{Name: ""} // invalid empty name

		mask := []string{"name"}
		err := schema.Apply(dst, src, mask)
		if err == nil {
			t.Fatal("expected validation error, got nil")
		}
		if !errors.Is(err, errEmptyName) {
			t.Errorf("expected errEmptyName, got %v", err)
		}
		if dst.Name != "Original" {
			t.Errorf("destination should not be modified on validation failure, got '%s'", dst.Name)
		}
	})

	t.Run("returns error on nil entity", func(t *testing.T) {
		dst := &TestEntity{}
		err := schema.Apply(dst, nil, []string{"name"})
		if !errors.Is(err, patch.ErrNilEntity) {
			t.Errorf("expected ErrNilEntity, got %v", err)
		}

		err = schema.Apply(nil, dst, []string{"name"})
		if !errors.Is(err, patch.ErrNilEntity) {
			t.Errorf("expected ErrNilEntity, got %v", err)
		}
	})
}
