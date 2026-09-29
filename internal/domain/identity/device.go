package identity

import (
	"fmt"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/id"
)

const (
	devicePrefix = "dev_"

	// DefaultDeviceExpiration defines the absolute lifespan of an enrolled trusted device (60 days).
	DefaultDeviceExpiration = 60 * 24 * time.Hour

	// DefaultDeviceInactivity defines the maximum allowed period without authentication (30 days).
	DefaultDeviceInactivity = 30 * 24 * time.Hour
)

// DeviceID represents a unique identifier for a trusted hardware device.
type DeviceID string

// NewDeviceID generates a new unique DeviceID.
func NewDeviceID() (DeviceID, error) {
	raw, err := id.Generate(devicePrefix)
	if err != nil {
		return "", err
	}
	return DeviceID(raw), nil
}

// ParseDeviceID parses and validates a string as a DeviceID.
func ParseDeviceID(s string) (DeviceID, error) {
	if err := id.Validate(s, devicePrefix); err != nil {
		return "", fmt.Errorf("invalid device ID: %w", err)
	}
	return DeviceID(s), nil
}

// Device represents a registered, hardware-backed trusted client device.
type Device struct {
	ID           DeviceID
	UserID       UserID
	PublicKey    []byte
	KeyAlgorithm string // "ES256"
	DeviceName   string
	CreatedAt    time.Time
	LastUsedAt   *time.Time
	ExpiresAt    time.Time
	RevokedAt    *time.Time
}

// IsRevoked checks if the device registration has been explicitly revoked.
func (d *Device) IsRevoked() bool {
	return d.RevokedAt != nil
}

// IsExpired checks if the device has surpassed its absolute expiration date.
func (d *Device) IsExpired(now time.Time) bool {
	return !d.ExpiresAt.IsZero() && now.After(d.ExpiresAt)
}

// IsInactive checks if the device has not authenticated within the allowed inactivity window.
func (d *Device) IsInactive(now time.Time, maxInactivity time.Duration) bool {
	if d.LastUsedAt == nil {
		// If never used after enrollment, measure inactivity from creation
		return now.Sub(d.CreatedAt) > maxInactivity
	}
	return now.Sub(*d.LastUsedAt) > maxInactivity
}

// Challenge represents an ephemeral cryptographic nonce used to prevent replay attacks during authentication or enrollment.
type Challenge struct {
	Nonce     string
	CreatedAt time.Time
	ExpiresAt time.Time
}

// IsExpired checks if the challenge has expired at the given reference time.
func (c *Challenge) IsExpired(now time.Time) bool {
	return !c.ExpiresAt.IsZero() && now.After(c.ExpiresAt)
}
