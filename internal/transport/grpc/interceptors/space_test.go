package interceptors

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/api"
	"github.com/masterkeysrd/saturn/internal/domain/space"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

type mockMemberStoreProvider struct {
	GetByIDFunc func(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) (*space.Member, error)
}

func (m *mockMemberStoreProvider) GetByID(ctx context.Context, spaceID space.SpaceID, userID space.SpaceID) (*space.Member, error) {
	if m.GetByIDFunc != nil {
		return m.GetByIDFunc(ctx, spaceID, userID)
	}
	return &space.Member{SpaceID: spaceID, UserID: userID, Role: space.RoleMember}, nil
}

func TestSpaceInterceptor_APIKey(t *testing.T) {
	spc1, _ := space.NewSpaceID()
	spc2, _ := space.NewSpaceID()
	spc3, _ := space.NewSpaceID()

	rules := []api.SpaceRule{
		{Selector: "saturn.finance.v1.Finance.*", Scoped: true},
	}

	tests := []struct {
		name        string
		principal   auth.Principal
		spaceHeader string
		memberErr   error
		wantSpaceID string
		wantCode    codes.Code
	}{
		{
			name: "Single-space API key auto-injects space-id when header omitted",
			principal: auth.Principal{
				Subject:         "usr_1",
				APIKeyID:        "apk_1",
				GrantedSpaceIDs: []string{string(spc1)},
			},
			wantSpaceID: string(spc1),
		},
		{
			name: "Single-space API key allows matching space-id header",
			principal: auth.Principal{
				Subject:         "usr_1",
				APIKeyID:        "apk_1",
				GrantedSpaceIDs: []string{string(spc1)},
			},
			spaceHeader: string(spc1),
			wantSpaceID: string(spc1),
		},
		{
			name: "Single-space API key rejects ungranted space-id header",
			principal: auth.Principal{
				Subject:         "usr_1",
				APIKeyID:        "apk_1",
				GrantedSpaceIDs: []string{string(spc1)},
			},
			spaceHeader: string(spc2),
			wantCode:    codes.PermissionDenied,
		},
		{
			name: "Multi-space API key without space-id header returns InvalidArgument",
			principal: auth.Principal{
				Subject:         "usr_1",
				APIKeyID:        "apk_1",
				GrantedSpaceIDs: []string{string(spc1), string(spc2)},
			},
			wantCode: codes.InvalidArgument,
		},
		{
			name: "Multi-space API key with granted space-id header succeeds",
			principal: auth.Principal{
				Subject:         "usr_1",
				APIKeyID:        "apk_1",
				GrantedSpaceIDs: []string{string(spc1), string(spc2)},
			},
			spaceHeader: string(spc2),
			wantSpaceID: string(spc2),
		},
		{
			name: "Multi-space API key with ungranted space-id header returns PermissionDenied",
			principal: auth.Principal{
				Subject:         "usr_1",
				APIKeyID:        "apk_1",
				GrantedSpaceIDs: []string{string(spc1), string(spc2)},
			},
			spaceHeader: string(spc3),
			wantCode:    codes.PermissionDenied,
		},
		{
			name: "API key membership check failure returns PermissionDenied",
			principal: auth.Principal{
				Subject:         "usr_1",
				APIKeyID:        "apk_1",
				GrantedSpaceIDs: []string{string(spc1)},
			},
			memberErr: errors.New("not a member"),
			wantCode:  codes.PermissionDenied,
		},
		{
			name: "JWT principal without space-id header returns InvalidArgument",
			principal: auth.Principal{
				Subject:   "usr_1",
				SessionID: "ses_1",
			},
			wantCode: codes.InvalidArgument,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			si := NewSpaceInterceptor(&mockMemberStoreProvider{
				GetByIDFunc: func(ctx context.Context, spaceID, userID space.SpaceID) (*space.Member, error) {
					if tc.memberErr != nil {
						return nil, tc.memberErr
					}
					return &space.Member{SpaceID: spaceID, UserID: userID, Role: space.RoleAdmin}, nil
				},
			}, rules)

			ctx := auth.WithPrincipal(context.Background(), tc.principal)
			if tc.spaceHeader != "" {
				ctx = metadata.NewIncomingContext(ctx, metadata.Pairs("space-id", tc.spaceHeader))
			}

			outCtx, err := si.intercept(ctx, "/saturn.finance.v1.Finance/ListBudgets")
			if tc.wantCode != codes.OK {
				if err == nil || status.Code(err) != tc.wantCode {
					t.Fatalf("expected status %v, got %v", tc.wantCode, err)
				}
				return
			}
			if err != nil {
				t.Fatalf("unexpected error: %v", err)
			}
			gotSpaceID, ok := auth.SpaceIDFromContext(outCtx)
			if !ok || gotSpaceID != tc.wantSpaceID {
				t.Errorf("expected SpaceID %q, got %q (ok=%v)", tc.wantSpaceID, gotSpaceID, ok)
			}
		})
	}
}

func TestSpaceInterceptor_MemberCache(t *testing.T) {
	origNow := timeNow
	defer func() { timeNow = origNow }()

	now := time.Date(2026, 4, 1, 12, 0, 0, 0, time.UTC)
	timeNow = func() time.Time { return now }

	spc1, _ := space.NewSpaceID()
	var calls int
	si := NewSpaceInterceptor(&mockMemberStoreProvider{
		GetByIDFunc: func(ctx context.Context, spaceID, userID space.SpaceID) (*space.Member, error) {
			calls++
			return &space.Member{SpaceID: spaceID, UserID: userID, Role: space.RoleAdmin}, nil
		},
	}, []api.SpaceRule{{Selector: "saturn.finance.v1.Finance.*", Scoped: true}})

	ctx := auth.WithPrincipal(context.Background(), auth.Principal{Subject: "usr_1", SessionID: "ses_1"})
	ctx = metadata.NewIncomingContext(ctx, metadata.Pairs("space-id", string(spc1)))

	// First call hits store
	if _, err := si.intercept(ctx, "/saturn.finance.v1.Finance/ListBudgets"); err != nil {
		t.Fatalf("first call failed: %v", err)
	}
	// Second call within TTL uses cache
	if _, err := si.intercept(ctx, "/saturn.finance.v1.Finance/ListBudgets"); err != nil {
		t.Fatalf("second call failed: %v", err)
	}
	if calls != 1 {
		t.Fatalf("expected 1 store call with cache hit, got %d", calls)
	}

	// Advance past 5s TTL -> refreshes from store
	now = now.Add(6 * time.Second)
	if _, err := si.intercept(ctx, "/saturn.finance.v1.Finance/ListBudgets"); err != nil {
		t.Fatalf("third call failed: %v", err)
	}
	if calls != 2 {
		t.Fatalf("expected 2 store calls after TTL expiry, got %d", calls)
	}
}
