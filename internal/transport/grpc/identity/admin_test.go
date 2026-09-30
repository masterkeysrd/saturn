package identity

import (
	"context"
	"errors"
	"testing"
	"time"

	adminidentityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/admin/v1"
	identityv1 "github.com/masterkeysrd/saturn/apis/saturn/identity/v1"
	"github.com/masterkeysrd/saturn/internal/application/iam"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

type mockCoordinator struct {
	iam.Coordinator
	unlockUserFunc         func(ctx context.Context, req *iam.UnlockUserRequest) (*iam.UnlockUserResponse, error)
	listActiveSessionsFunc func(ctx context.Context, req *iam.ListActiveSessionsRequest) (*iam.ListActiveSessionsResponse, error)
}

func (m *mockCoordinator) UnlockUser(ctx context.Context, req *iam.UnlockUserRequest) (*iam.UnlockUserResponse, error) {
	if m.unlockUserFunc != nil {
		return m.unlockUserFunc(ctx, req)
	}
	return nil, nil
}

func (m *mockCoordinator) ListActiveSessions(ctx context.Context, req *iam.ListActiveSessionsRequest) (*iam.ListActiveSessionsResponse, error) {
	if m.listActiveSessionsFunc != nil {
		return m.listActiveSessionsFunc(ctx, req)
	}
	return nil, nil
}

func TestAdminHandler_UnlockUser(t *testing.T) {
	ctx := context.Background()
	lockTime := time.Now().Add(15 * time.Minute)

	t.Run("Success", func(t *testing.T) {
		coord := &mockCoordinator{
			unlockUserFunc: func(ctx context.Context, req *iam.UnlockUserRequest) (*iam.UnlockUserResponse, error) {
				if req.UserID != "usr_123" {
					t.Fatalf("expected usr_123, got %s", req.UserID)
				}
				return &iam.UnlockUserResponse{
					User: &identity.User{
						ID:                  "usr_123",
						Email:               "user@example.com",
						Username:            "testuser",
						Name:                "Test User",
						Status:              identity.UserStatusActive,
						AccessLevel:         identity.AccessLevelUser,
						FailedLoginAttempts: 0,
						LockedUntil:         nil,
					},
				}, nil
			},
		}

		handler := NewAdminHandler(coord)
		resp, err := handler.UnlockUser(ctx, &adminidentityv1.UnlockUserRequest{UserId: "usr_123"})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if resp == nil {
			t.Fatal("expected user, got nil")
		}
		if resp.Id != "usr_123" {
			t.Errorf("expected usr_123, got %s", resp.Id)
		}
		if resp.FailedLoginAttempts != 0 {
			t.Errorf("expected 0 failed login attempts, got %d", resp.FailedLoginAttempts)
		}
		if resp.LockedUntil != nil {
			t.Errorf("expected nil LockedUntil, got %v", resp.LockedUntil)
		}
	})

	t.Run("Coordinator Error", func(t *testing.T) {
		coord := &mockCoordinator{
			unlockUserFunc: func(ctx context.Context, req *iam.UnlockUserRequest) (*iam.UnlockUserResponse, error) {
				return nil, errors.New("database failure")
			},
		}

		handler := NewAdminHandler(coord)
		_, err := handler.UnlockUser(ctx, &adminidentityv1.UnlockUserRequest{UserId: "usr_123"})
		if err == nil {
			t.Fatal("expected error, got nil")
		}
	})

	t.Run("toAdminUser with LockedUntil and FailedLoginAttempts", func(t *testing.T) {
		u := &identity.User{
			ID:                  "usr_locked",
			Email:               "locked@example.com",
			Username:            "locked",
			Status:              identity.UserStatusActive,
			AccessLevel:         identity.AccessLevelAdmin,
			FailedLoginAttempts: 5,
			LockedUntil:         &lockTime,
		}
		adminU := toAdminUser(u)
		if adminU.FailedLoginAttempts != 5 {
			t.Errorf("expected 5 failed attempts, got %d", adminU.FailedLoginAttempts)
		}
		if adminU.LockedUntil == nil {
			t.Fatal("expected non-nil LockedUntil")
		}
		if adminU.AccessLevel != adminidentityv1.AccessLevel_ACCESS_LEVEL_ADMIN {
			t.Errorf("expected ACCESS_LEVEL_ADMIN, got %v", adminU.AccessLevel)
		}
	})
}

func TestHandler_ListActiveSessions(t *testing.T) {
	now := time.Now()

	t.Run("Missing Principal", func(t *testing.T) {
		h := NewHandler(&IAMApplication{})
		_, err := h.ListActiveSessions(context.Background(), &identityv1.ListActiveSessionsRequest{})
		if err == nil {
			t.Fatal("expected unauthenticated error, got nil")
		}
	})

	t.Run("Success with IsCurrent mapped", func(t *testing.T) {
		coord := &mockCoordinator{
			listActiveSessionsFunc: func(ctx context.Context, req *iam.ListActiveSessionsRequest) (*iam.ListActiveSessionsResponse, error) {
				if req.UserID != "usr_me" {
					t.Fatalf("expected usr_me, got %s", req.UserID)
				}
				if req.CurrentSessionID != "sess_curr" {
					t.Fatalf("expected sess_curr, got %s", req.CurrentSessionID)
				}
				return &iam.ListActiveSessionsResponse{
					Sessions: []*iam.ActiveSession{
						{
							SessionID:  "sess_curr",
							UserAgent:  "Mozilla/5.0",
							IPAddress:  "127.0.0.1",
							CreateTime: now,
							LastUsedAt: now,
							IsCurrent:  true,
						},
						{
							SessionID:  "sess_other",
							UserAgent:  "Safari/5.0",
							IPAddress:  "192.168.1.1",
							CreateTime: now,
							LastUsedAt: now,
							IsCurrent:  false,
						},
					},
				}, nil
			},
		}

		h := NewHandler(&IAMApplication{Coordinator: coord})
		ctx := auth.WithPrincipal(context.Background(), auth.Principal{
			Subject:   "usr_me",
			SessionID: "sess_curr",
		})

		resp, err := h.ListActiveSessions(ctx, &identityv1.ListActiveSessionsRequest{})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if len(resp.Sessions) != 2 {
			t.Fatalf("expected 2 sessions, got %d", len(resp.Sessions))
		}
		if !resp.Sessions[0].IsCurrent {
			t.Errorf("expected session 0 IsCurrent to be true")
		}
		if resp.Sessions[1].IsCurrent {
			t.Errorf("expected session 1 IsCurrent to be false")
		}
	})
}
