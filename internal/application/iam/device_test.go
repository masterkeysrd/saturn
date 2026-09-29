package iam

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

func TestCoordinator_Device(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	t.Run("CreateAuthChallenge", func(t *testing.T) {
		tests := []struct {
			name        string
			setupMock   func(m *IdentityServiceMock)
			expectedErr bool
			expectNonce string
		}{
			{
				name: "Success",
				setupMock: func(m *IdentityServiceMock) {
					m.CreateAuthChallengeFunc = func(ctx context.Context) (*identity.Challenge, error) {
						return &identity.Challenge{
							Nonce:     "chg_123",
							ExpiresAt: now.Add(5 * time.Minute),
						}, nil
					}
				},
				expectedErr: false,
				expectNonce: "chg_123",
			},
			{
				name: "IdentityService error",
				setupMock: func(m *IdentityServiceMock) {
					m.CreateAuthChallengeFunc = func(ctx context.Context) (*identity.Challenge, error) {
						return nil, errors.New("challenge error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idMock := &IdentityServiceMock{}
				if tc.setupMock != nil {
					tc.setupMock(idMock)
				}
				coord := NewCoordinator(Dependencies{IdentityService: idMock})
				resp, err := coord.CreateAuthChallenge(ctx)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if resp.Challenge != tc.expectNonce {
					t.Errorf("expected challenge %s, got %s", tc.expectNonce, resp.Challenge)
				}
			})
		}
	})

	t.Run("CreateDevice", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *CreateDeviceRequest
			setupMock   func(m *IdentityServiceMock)
			expectedErr bool
		}{
			{
				name: "Success",
				req: &CreateDeviceRequest{
					UserID:     "usr_1",
					DeviceName: "Phone",
					PublicKey:  []byte("pk"),
					Algorithm:  "ES256",
					Challenge:  "chg_1",
					Signature:  []byte("sig"),
					TOTPCode:   "123456",
				},
				setupMock: func(m *IdentityServiceMock) {
					m.CreateDeviceFunc = func(ctx context.Context, req identity.CreateDeviceRequest) (*identity.Device, error) {
						return &identity.Device{ID: "dev_1", DeviceName: req.DeviceName}, nil
					}
				},
				expectedErr: false,
			},
			{
				name: "IdentityService error",
				req: &CreateDeviceRequest{
					UserID: "usr_1",
				},
				setupMock: func(m *IdentityServiceMock) {
					m.CreateDeviceFunc = func(ctx context.Context, req identity.CreateDeviceRequest) (*identity.Device, error) {
						return nil, errors.New("create device error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idMock := &IdentityServiceMock{}
				if tc.setupMock != nil {
					tc.setupMock(idMock)
				}
				coord := NewCoordinator(Dependencies{IdentityService: idMock})
				dev, err := coord.CreateDevice(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil || dev == nil {
					t.Fatalf("unexpected result: dev=%v, err=%v", dev, err)
				}
			})
		}
	})

	t.Run("ListDevices", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *ListDevicesRequest
			setupMock   func(m *IdentityServiceMock)
			expectedErr bool
			expectCount int
		}{
			{
				name: "Success",
				req:  &ListDevicesRequest{UserID: "usr_1"},
				setupMock: func(m *IdentityServiceMock) {
					m.ListDevicesFunc = func(ctx context.Context, userID identity.UserID) ([]*identity.Device, error) {
						return []*identity.Device{{ID: "dev_1"}}, nil
					}
				},
				expectedErr: false,
				expectCount: 1,
			},
			{
				name: "IdentityService error",
				req:  &ListDevicesRequest{UserID: "usr_1"},
				setupMock: func(m *IdentityServiceMock) {
					m.ListDevicesFunc = func(ctx context.Context, userID identity.UserID) ([]*identity.Device, error) {
						return nil, errors.New("list error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idMock := &IdentityServiceMock{}
				if tc.setupMock != nil {
					tc.setupMock(idMock)
				}
				coord := NewCoordinator(Dependencies{IdentityService: idMock})
				resp, err := coord.ListDevices(ctx, tc.req)
				if tc.expectedErr {
					if err == nil {
						t.Fatal("expected error, got nil")
					}
					return
				}
				if err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
				if len(resp.Devices) != tc.expectCount {
					t.Errorf("expected %d devices, got %d", tc.expectCount, len(resp.Devices))
				}
			})
		}
	})

	t.Run("RevokeDevice", func(t *testing.T) {
		tests := []struct {
			name        string
			req         *RevokeDeviceRequest
			setupMock   func(m *IdentityServiceMock)
			expectedErr bool
		}{
			{
				name: "Success",
				req:  &RevokeDeviceRequest{UserID: "usr_1", DeviceID: "dev_1"},
				setupMock: func(m *IdentityServiceMock) {
					m.RevokeDeviceFunc = func(ctx context.Context, userID identity.UserID, deviceID identity.DeviceID) error {
						return nil
					}
				},
				expectedErr: false,
			},
			{
				name: "IdentityService error",
				req:  &RevokeDeviceRequest{UserID: "usr_1", DeviceID: "dev_1"},
				setupMock: func(m *IdentityServiceMock) {
					m.RevokeDeviceFunc = func(ctx context.Context, userID identity.UserID, deviceID identity.DeviceID) error {
						return errors.New("revoke error")
					}
				},
				expectedErr: true,
			},
		}

		for _, tc := range tests {
			t.Run(tc.name, func(t *testing.T) {
				idMock := &IdentityServiceMock{}
				if tc.setupMock != nil {
					tc.setupMock(idMock)
				}
				coord := NewCoordinator(Dependencies{IdentityService: idMock})
				err := coord.RevokeDevice(ctx, tc.req)
				if tc.expectedErr && err == nil {
					t.Fatal("expected error, got nil")
				}
				if !tc.expectedErr && err != nil {
					t.Fatalf("unexpected error: %v", err)
				}
			})
		}
	})
}
