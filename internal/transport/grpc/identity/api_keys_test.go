package identity

import (
	"context"
	"testing"
	"time"

	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

type apiKeyMockCoordinator struct {
	iam.Coordinator
	createFunc func(ctx context.Context, req *iam.CreateAPIKeyRequest) (*identity.APIKey, error)
	getFunc    func(ctx context.Context, req *iam.GetAPIKeyRequest) (*identity.APIKey, error)
	listFunc   func(ctx context.Context, req *iam.ListAPIKeysRequest) ([]*identity.APIKey, error)
	updateFunc func(ctx context.Context, req *iam.UpdateAPIKeyRequest) (*identity.APIKey, error)
	deleteFunc func(ctx context.Context, req *iam.DeleteAPIKeyRequest) error
}

func (m *apiKeyMockCoordinator) CreateAPIKey(ctx context.Context, req *iam.CreateAPIKeyRequest) (*identity.APIKey, error) {
	return m.createFunc(ctx, req)
}

func (m *apiKeyMockCoordinator) GetAPIKey(ctx context.Context, req *iam.GetAPIKeyRequest) (*identity.APIKey, error) {
	return m.getFunc(ctx, req)
}

func (m *apiKeyMockCoordinator) ListAPIKeys(ctx context.Context, req *iam.ListAPIKeysRequest) ([]*identity.APIKey, error) {
	return m.listFunc(ctx, req)
}

func (m *apiKeyMockCoordinator) UpdateAPIKey(ctx context.Context, req *iam.UpdateAPIKeyRequest) (*identity.APIKey, error) {
	return m.updateFunc(ctx, req)
}

func (m *apiKeyMockCoordinator) DeleteAPIKey(ctx context.Context, req *iam.DeleteAPIKeyRequest) error {
	return m.deleteFunc(ctx, req)
}

func TestHandler_APIKeys(t *testing.T) {
	now := time.Now().UTC()
	coord := &apiKeyMockCoordinator{
		createFunc: func(ctx context.Context, req *iam.CreateAPIKeyRequest) (*identity.APIKey, error) {
			return &identity.APIKey{
				ID:         "apk_1",
				UserID:     req.UserID,
				Name:       req.Name,
				KeyPrefix:  "sat_12345678",
				RawKey:     "sat_1234567890_secret",
				Scopes:     req.Scopes,
				SpaceIDs:   req.SpaceIDs,
				CreateTime: now,
				UpdateTime: now,
			}, nil
		},
		getFunc: func(ctx context.Context, req *iam.GetAPIKeyRequest) (*identity.APIKey, error) {
			return &identity.APIKey{
				ID:         req.ID,
				Name:       "CLI",
				KeyPrefix:  "sat_12345678",
				RawKey:     "should_not_be_exposed",
				Scopes:     []string{"finance:read"},
				SpaceIDs:   []string{"spc_1"},
				CreateTime: now,
				UpdateTime: now,
			}, nil
		},
		listFunc: func(ctx context.Context, req *iam.ListAPIKeysRequest) ([]*identity.APIKey, error) {
			return []*identity.APIKey{
				{
					ID:         "apk_1",
					Name:       "CLI",
					KeyPrefix:  "sat_12345678",
					RawKey:     "should_not_be_exposed",
					Scopes:     []string{"finance:read"},
					SpaceIDs:   []string{"spc_1"},
					CreateTime: now,
					UpdateTime: now,
				},
			}, nil
		},
		updateFunc: func(ctx context.Context, req *iam.UpdateAPIKeyRequest) (*identity.APIKey, error) {
			return &identity.APIKey{
				ID:         req.ID,
				Name:       req.Name,
				KeyPrefix:  "sat_12345678",
				RawKey:     "should_not_be_exposed",
				Scopes:     req.Scopes,
				SpaceIDs:   req.SpaceIDs,
				CreateTime: now,
				UpdateTime: now,
			}, nil
		},
		deleteFunc: func(ctx context.Context, req *iam.DeleteAPIKeyRequest) error {
			return nil
		},
	}

	h := NewHandler(NewIAMApplication(coord))
	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1"})

	created, err := h.CreateAPIKey(ctx, &identityv1.CreateAPIKeyRequest{
		ApiKey: &identityv1.APIKey{
			Name:     "CLI",
			Scopes:   []string{"finance:read"},
			SpaceIds: []string{"spc_1"},
		},
	})
	if err != nil {
		t.Fatalf("CreateAPIKey failed: %v", err)
	}
	if created.GetRawKey() != "sat_1234567890_secret" {
		t.Errorf("expected raw_key on CreateAPIKey, got %q", created.GetRawKey())
	}

	got, err := h.GetAPIKey(ctx, &identityv1.GetAPIKeyRequest{Id: "apk_1"})
	if err != nil || got.GetRawKey() != "" {
		t.Fatalf("GetAPIKey unexpected: got=%+v err=%v", got, err)
	}

	listed, err := h.ListAPIKeys(ctx, &identityv1.ListAPIKeysRequest{})
	if err != nil || len(listed.GetApiKeys()) != 1 || listed.GetApiKeys()[0].GetRawKey() != "" {
		t.Fatalf("ListAPIKeys unexpected: listed=%+v err=%v", listed, err)
	}

	updated, err := h.UpdateAPIKey(ctx, &identityv1.UpdateAPIKeyRequest{
		Id:         "apk_1",
		ApiKey:     &identityv1.APIKey{Name: "Updated", Scopes: []string{"finance:write"}, SpaceIds: []string{"spc_1"}},
		UpdateMask: &fieldmaskpb.FieldMask{Paths: []string{"name"}},
	})
	if err != nil || updated.GetName() != "Updated" || updated.GetRawKey() != "" {
		t.Fatalf("UpdateAPIKey unexpected: updated=%+v err=%v", updated, err)
	}

	if _, err := h.DeleteAPIKey(ctx, &identityv1.DeleteAPIKeyRequest{Id: "apk_1"}); err != nil {
		t.Fatalf("DeleteAPIKey failed: %v", err)
	}
}
