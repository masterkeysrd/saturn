package iam

import (
	"context"

	"github.com/masterkeysrd/saturn/internal/domain/identity"
)

// CreateAuthChallengeResponse holds the generated challenge nonce and expiry.
type CreateAuthChallengeResponse struct {
	Challenge string
	ExpiresAt int64
}

// CreateDeviceRequest encapsulates the parameters needed to enroll a new trusted device.
type CreateDeviceRequest struct {
	UserID     identity.UserID
	DeviceName string
	PublicKey  []byte
	Algorithm  string
	Challenge  string
	Signature  []byte
	TOTPCode   string
}

// ListDevicesRequest encapsulates the caller's user ID.
type ListDevicesRequest struct {
	UserID identity.UserID
}

// ListDevicesResponse holds the list of enrolled trusted devices.
type ListDevicesResponse struct {
	Devices []*identity.Device
}

// RevokeDeviceRequest encapsulates the caller's user ID and target device ID.
type RevokeDeviceRequest struct {
	UserID   identity.UserID
	DeviceID identity.DeviceID
}

// CreateAuthChallenge generates a short-lived random nonce challenge.
func (c *coordinator) CreateAuthChallenge(ctx context.Context) (*CreateAuthChallengeResponse, error) {
	chg, err := c.identityService.CreateAuthChallenge(ctx)
	if err != nil {
		return nil, err
	}
	return &CreateAuthChallengeResponse{
		Challenge: chg.Nonce,
		ExpiresAt: chg.ExpiresAt.Unix(),
	}, nil
}

// CreateDevice registers a new trusted hardware device for an authenticated user.
func (c *coordinator) CreateDevice(ctx context.Context, req *CreateDeviceRequest) (*identity.Device, error) {
	return c.identityService.CreateDevice(ctx, identity.CreateDeviceRequest{
		UserID:     req.UserID,
		DeviceName: req.DeviceName,
		PublicKey:  req.PublicKey,
		Algorithm:  req.Algorithm,
		Challenge:  req.Challenge,
		Signature:  req.Signature,
		TOTPCode:   req.TOTPCode,
	})
}

// ListDevices returns all active trusted devices for the user.
func (c *coordinator) ListDevices(ctx context.Context, req *ListDevicesRequest) (*ListDevicesResponse, error) {
	devices, err := c.identityService.ListDevices(ctx, req.UserID)
	if err != nil {
		return nil, err
	}
	return &ListDevicesResponse{
		Devices: devices,
	}, nil
}

// RevokeDevice revokes a trusted device and terminates its associated sessions.
func (c *coordinator) RevokeDevice(ctx context.Context, req *RevokeDeviceRequest) error {
	return c.identityService.RevokeDevice(ctx, req.UserID, req.DeviceID)
}
