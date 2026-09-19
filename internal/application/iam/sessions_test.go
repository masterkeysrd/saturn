package iam

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

func TestCoordinator_Sessions(t *testing.T) {
	now := time.Now()
	usedAt := now.Add(-5 * time.Minute)

	t.Run("ListActiveSessions", func(t *testing.T) {
		tests := []struct {
			name          string
			req           *ListActiveSessionsRequest
			mockList      func(ctx context.Context, userID identity.UserID) ([]*identity.Session, error)
			expectedCount int
			expectedError bool
			validateFirst func(t *testing.T, s *ActiveSession)
		}{
			{
				name: "Success with LastUsedAt populated and nil fallback",
				req:  &ListActiveSessionsRequest{UserID: "usr_1"},
				mockList: func(ctx context.Context, userID identity.UserID) ([]*identity.Session, error) {
					return []*identity.Session{
						{
							ID:         "sess_1",
							UserAgent:  "Firefox",
							IPAddress:  "192.168.1.1",
							CreateTime: now,
							LastUsedAt: &usedAt,
						},
						{
							ID:         "sess_2",
							UserAgent:  "Safari",
							IPAddress:  "192.168.1.2",
							CreateTime: now,
							LastUsedAt: nil, // Should fallback to CreateTime
						},
					}, nil
				},
				expectedCount: 2,
				expectedError: false,
				validateFirst: func(t *testing.T, s *ActiveSession) {
					if s.SessionID != "sess_1" || s.LastUsedAt != usedAt {
						t.Errorf("unexpected session: %+v", s)
					}
				},
			},
			{
				name: "Domain error",
				req:  &ListActiveSessionsRequest{UserID: "usr_1"},
				mockList: func(ctx context.Context, userID identity.UserID) ([]*identity.Session, error) {
					return nil, errors.New("sessions query error")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					IdentityService: &IdentityServiceMock{ListActiveSessionsFunc: tc.mockList},
				})
				res, err := coord.ListActiveSessions(context.Background(), tc.req)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(res.Sessions) != tc.expectedCount {
					t.Errorf("expected %d sessions, got %d", tc.expectedCount, len(res.Sessions))
				}
				if tc.validateFirst != nil && len(res.Sessions) > 0 {
					tc.validateFirst(t, res.Sessions[0])
					if res.Sessions[1].LastUsedAt != now {
						t.Errorf("expected fallback to CreateTime %v, got %v", now, res.Sessions[1].LastUsedAt)
					}
				}
			})
		}
	})

	t.Run("RevokeSession", func(t *testing.T) {
		tests := []struct {
			name          string
			req           *RevokeSessionRequest
			mockRevoke    func(ctx context.Context, sessionID identity.SessionID, userID identity.UserID) error
			expectedError bool
		}{
			{
				name: "Success",
				req:  &RevokeSessionRequest{SessionID: "sess_1", UserID: "usr_1"},
				mockRevoke: func(ctx context.Context, sessionID identity.SessionID, userID identity.UserID) error {
					if sessionID != "sess_1" || userID != "usr_1" {
						t.Errorf("unexpected revoke args: session=%v user=%v", sessionID, userID)
					}
					return nil
				},
				expectedError: false,
			},
			{
				name: "Domain error",
				req:  &RevokeSessionRequest{SessionID: "sess_1", UserID: "usr_1"},
				mockRevoke: func(ctx context.Context, sessionID identity.SessionID, userID identity.UserID) error {
					return errors.New("session not found")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					IdentityService: &IdentityServiceMock{RevokeSessionByIDFunc: tc.mockRevoke},
				})
				res, err := coord.RevokeSession(context.Background(), tc.req)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil {
					t.Fatal("expected non-nil response")
				}
			})
		}
	})

	t.Run("RevokeAllSessions", func(t *testing.T) {
		tests := []struct {
			name          string
			req           *RevokeAllSessionsRequest
			mockRevokeAll func(ctx context.Context, userID identity.UserID) (int64, error)
			expectedError bool
		}{
			{
				name: "Success",
				req:  &RevokeAllSessionsRequest{UserID: "usr_1"},
				mockRevokeAll: func(ctx context.Context, userID identity.UserID) (int64, error) {
					if userID != "usr_1" {
						t.Errorf("unexpected user ID: %v", userID)
					}
					return 3, nil
				},
				expectedError: false,
			},
			{
				name: "Domain error",
				req:  &RevokeAllSessionsRequest{UserID: "usr_1"},
				mockRevokeAll: func(ctx context.Context, userID identity.UserID) (int64, error) {
					return 0, errors.New("cannot revoke sessions")
				},
				expectedError: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				coord := NewCoordinator(Dependencies{
					IdentityService: &IdentityServiceMock{RevokeAllSessionsFunc: tc.mockRevokeAll},
				})
				res, err := coord.RevokeAllSessions(context.Background(), tc.req)
				if tc.expectedError {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if res == nil {
					t.Fatal("expected non-nil response")
				}
			})
		}
	})
}
