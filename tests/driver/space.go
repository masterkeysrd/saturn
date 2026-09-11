//go:build integration

package driver

import (
	"testing"

	"github.com/masterkeysrd/saturn/apis/saturn"
	spacev1 "github.com/masterkeysrd/saturn/apis/saturn/space/v1"
	"google.golang.org/protobuf/types/known/fieldmaskpb"
)

// SpaceDriver provides fluent methods for space management using spacev1.Client.
type SpaceDriver struct {
	driver    *Driver
	client    *spacev1.Client
	lastToken string
}

func (s *SpaceDriver) getClient() *spacev1.Client {
	if s.client == nil || s.lastToken != s.driver.state.AccessToken {
		s.lastToken = s.driver.state.AccessToken
		s.client = spacev1.NewClient(saturn.Config{
			BaseURL:     s.driver.env.ServerURL,
			AccessToken: s.lastToken,
			HTTPClient:  s.driver.httpClient,
		})
	}
	return s.client
}

// Client returns the space v1 client bound to the current access token.
func (s *SpaceDriver) Client() *spacev1.Client {
	return s.getClient()
}

// Ensure creates or selects a workspace and sets it as active in session state.
func (s *SpaceDriver) Ensure(tb testing.TB, spaceName string) *SpaceDriver {
	tb.Helper()
	if tb.Failed() {
		return s
	}

	space, err := s.CreateSpace(tb, spaceName, "")
	if err != nil {
		tb.Fatalf("CreateSpace SDK call failed: %v", err)
	}

	s.driver.state.SpaceID = space.GetId()
	s.driver.state.Spaces[spaceName] = &SpaceInfo{
		ID:          space.GetId(),
		Name:        space.GetName(),
		Description: space.GetDescription(),
		OwnerID:     space.GetOwnerId(),
		Version:     space.GetVersion(),
	}
	s.driver.state.LastSpace = s.driver.state.Spaces[spaceName]
	return s
}

// CreateSpace creates a new workspace.
func (s *SpaceDriver) CreateSpace(tb testing.TB, name, description string) (*spacev1.Space, error) {
	tb.Helper()
	client := s.getClient()
	return client.CreateSpace(tb.Context(), &spacev1.CreateSpaceRequest{
		Name:        name,
		Description: description,
	})
}

// GetSpace retrieves a workspace by ID.
func (s *SpaceDriver) GetSpace(tb testing.TB, spaceID string) (*spacev1.Space, error) {
	tb.Helper()
	client := s.getClient()
	return client.GetSpace(tb.Context(), &spacev1.GetSpaceRequest{
		SpaceId: spaceID,
	})
}

// UpdateSpace updates a workspace with optional field mask and version check.
func (s *SpaceDriver) UpdateSpace(tb testing.TB, spaceID, name, description string, mask []string, version *int64) (*spacev1.Space, error) {
	tb.Helper()
	client := s.getClient()

	req := &spacev1.UpdateSpaceRequest{
		SpaceId: spaceID,
		Space: &spacev1.Space{
			Name:        name,
			Description: description,
		},
		Version: version,
	}
	if len(mask) > 0 {
		req.UpdateMask = &fieldmaskpb.FieldMask{Paths: mask}
	}

	return client.UpdateSpace(tb.Context(), req)
}

// DeleteSpace deletes a workspace by ID.
func (s *SpaceDriver) DeleteSpace(tb testing.TB, spaceID string) (*spacev1.DeleteSpaceResponse, error) {
	tb.Helper()
	client := s.getClient()
	return client.DeleteSpace(tb.Context(), &spacev1.DeleteSpaceRequest{
		SpaceId: spaceID,
	})
}

// ListSpaces lists user workspaces with pagination.
func (s *SpaceDriver) ListSpaces(tb testing.TB, pageSize int32, pageToken string) (*spacev1.ListSpacesResponse, error) {
	tb.Helper()
	client := s.getClient()
	return client.ListSpaces(tb.Context(), &spacev1.ListSpacesRequest{
		PageSize:      pageSize,
		NextPageToken: pageToken,
	})
}

// AddSpaceMember adds a member to a workspace.
func (s *SpaceDriver) AddSpaceMember(tb testing.TB, spaceID, userID, role string) (*spacev1.SpaceMember, error) {
	tb.Helper()
	client := s.getClient()
	return client.AddSpaceMember(tb.Context(), &spacev1.AddSpaceMemberRequest{
		SpaceId: spaceID,
		UserId:  userID,
		Role:    role,
	})
}

// UpdateSpaceMemberRole updates a member's role in a workspace.
func (s *SpaceDriver) UpdateSpaceMemberRole(tb testing.TB, spaceID, userID, role string) (*spacev1.SpaceMember, error) {
	tb.Helper()
	client := s.getClient()
	return client.UpdateSpaceMemberRole(tb.Context(), &spacev1.UpdateSpaceMemberRoleRequest{
		SpaceId: spaceID,
		UserId:  userID,
		Role:    role,
	})
}

// RemoveSpaceMember removes a member from a workspace.
func (s *SpaceDriver) RemoveSpaceMember(tb testing.TB, spaceID, userID string) (*spacev1.RemoveSpaceMemberResponse, error) {
	tb.Helper()
	client := s.getClient()
	return client.RemoveSpaceMember(tb.Context(), &spacev1.RemoveSpaceMemberRequest{
		SpaceId: spaceID,
		UserId:  userID,
	})
}

// ListSpaceMembers lists all members of a workspace with pagination.
func (s *SpaceDriver) ListSpaceMembers(tb testing.TB, spaceID string, pageSize int32, pageToken string) (*spacev1.ListSpaceMembersResponse, error) {
	tb.Helper()
	client := s.getClient()
	return client.ListSpaceMembers(tb.Context(), &spacev1.ListSpaceMembersRequest{
		SpaceId:       spaceID,
		PageSize:      pageSize,
		NextPageToken: pageToken,
	})
}
