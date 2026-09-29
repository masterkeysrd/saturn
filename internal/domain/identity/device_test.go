package identity

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/crypto"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

func TestDeviceID(t *testing.T) {
	t.Run("NewDeviceID generates valid ID with dev_ prefix", func(t *testing.T) {
		id, err := NewDeviceID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if !strings.HasPrefix(string(id), "dev_") {
			t.Fatalf("expected prefix dev_, got %s", id)
		}
	})

	t.Run("ParseDeviceID validates correctly", func(t *testing.T) {
		id, err := NewDeviceID()
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		parsed, err := ParseDeviceID(string(id))
		if err != nil {
			t.Fatalf("expected valid parse, got %v", err)
		}
		if parsed != id {
			t.Fatalf("expected %s, got %s", id, parsed)
		}

		if _, err := ParseDeviceID("invalid_prefix"); err == nil {
			t.Fatalf("expected error for invalid prefix, got nil")
		}
	})
}

func TestDevice_Lifecycle(t *testing.T) {
	now := time.Now()
	dev := &Device{
		ID:           "dev_123",
		UserID:       "usr_123",
		CreatedAt:    now.Add(-10 * 24 * time.Hour),
		ExpiresAt:    now.Add(50 * 24 * time.Hour),
		KeyAlgorithm: "ES256",
		DeviceName:   "iPhone",
	}

	if dev.IsRevoked() {
		t.Fatalf("expected device not revoked")
	}
	if dev.IsExpired(now) {
		t.Fatalf("expected device not expired")
	}
	if dev.IsInactive(now, DefaultDeviceInactivity) {
		t.Fatalf("expected device not inactive within 10 days")
	}

	// Test 30-day inactivity
	oldTime := now.Add(-31 * 24 * time.Hour)
	dev.LastUsedAt = &oldTime
	if !dev.IsInactive(now, DefaultDeviceInactivity) {
		t.Fatalf("expected device to be inactive after 31 days")
	}

	// Test 60-day expiration
	dev.ExpiresAt = now.Add(-1 * time.Minute)
	if !dev.IsExpired(now) {
		t.Fatalf("expected device to be expired")
	}

	// Test revocation
	revTime := now
	dev.RevokedAt = &revTime
	if !dev.IsRevoked() {
		t.Fatalf("expected device to be revoked")
	}
}

func TestDevice_ServiceMethods(t *testing.T) {
	ctx := context.Background()
	now := time.Now()

	devStore := &DeviceStoreMock{}
	chgStore := &AuthChallengeStoreMock{}
	verifier := &DeviceVerifierMock{}

	svc := NewService(Dependencies{
		DeviceStore:    devStore,
		ChallengeStore: chgStore,
		DeviceVerifier: verifier,
	})

	t.Run("CreateAuthChallenge generates challenge and persists with 5m TTL", func(t *testing.T) {
		var persisted *Challenge
		chgStore.CreateChallengeFunc = func(ctx context.Context, challenge *Challenge) error {
			persisted = challenge
			return nil
		}

		chg, err := svc.CreateAuthChallenge(ctx)
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if chg == nil {
			t.Fatalf("expected challenge, got nil")
		}
		if !strings.HasPrefix(chg.Nonce, "chg_") {
			t.Fatalf("expected prefix chg_, got %s", chg.Nonce)
		}
		if persisted != chg {
			t.Fatalf("expected stored challenge %v, got %v", chg, persisted)
		}
		if chg.ExpiresAt.Before(time.Now()) {
			t.Fatalf("expected expiry in the future, got %v", chg.ExpiresAt)
		}
		if chg.IsExpired(time.Now()) {
			t.Fatalf("expected challenge not to be expired immediately")
		}
		if !chg.IsExpired(chg.ExpiresAt.Add(time.Second)) {
			t.Fatalf("expected challenge to be expired after expiry time")
		}
	})

	t.Run("CreateDevice succeeds and creates device when valid", func(t *testing.T) {
		chgStore.DeleteChallengeFunc = func(ctx context.Context, challenge string) error {
			return nil
		}
		verifier.VerifyAssertionFunc = func(params crypto.VerifyAssertionParams) error {
			return nil
		}
		var createdDev *Device
		devStore.CreateDeviceFunc = func(ctx context.Context, device *Device) error {
			createdDev = device
			return nil
		}

		dev, err := svc.CreateDevice(ctx, CreateDeviceRequest{
			UserID:     "usr_123",
			DeviceName: "Pixel 9",
			PublicKey:  []byte("valid_key"),
			Algorithm:  "ES256",
			Challenge:  "chg_123",
			Signature:  []byte("sig_123"),
			Now:        now,
		})

		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if dev == nil || createdDev == nil {
			t.Fatalf("expected device created")
		}
		if dev.DeviceName != "Pixel 9" {
			t.Fatalf("expected name Pixel 9, got %s", dev.DeviceName)
		}
		if dev.ExpiresAt.Sub(now) != DefaultDeviceExpiration {
			t.Fatalf("expected 60-day expiration, got %v", dev.ExpiresAt.Sub(now))
		}
	})

	t.Run("CreateDevice fails if challenge is consumed or expired", func(t *testing.T) {
		chgStore.DeleteChallengeFunc = func(ctx context.Context, challenge string) error {
			return errors.E(errors.NotExist)
		}

		_, err := svc.CreateDevice(ctx, CreateDeviceRequest{
			UserID:     "usr_123",
			DeviceName: "Pixel 9",
			PublicKey:  []byte("valid_key"),
			Algorithm:  "ES256",
			Challenge:  "chg_stale",
			Signature:  []byte("sig_123"),
			Now:        now,
		})

		if err == nil {
			t.Fatalf("expected error for consumed challenge, got nil")
		}
	})

	t.Run("CreateDevice fails if signature verifier fails", func(t *testing.T) {
		chgStore.DeleteChallengeFunc = func(ctx context.Context, challenge string) error {
			return nil
		}
		verifier.VerifyAssertionFunc = func(params crypto.VerifyAssertionParams) error {
			return errors.New("bad signature")
		}

		_, err := svc.CreateDevice(ctx, CreateDeviceRequest{
			UserID:     "usr_123",
			DeviceName: "Pixel 9",
			PublicKey:  []byte("valid_key"),
			Algorithm:  "ES256",
			Challenge:  "chg_123",
			Signature:  []byte("bad_sig"),
			Now:        now,
		})

		if err == nil {
			t.Fatalf("expected signature error, got nil")
		}
	})
}
