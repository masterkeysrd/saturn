package storage

import (
	"context"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

type deviceDB struct {
	ID           string     `db:"id"`
	UserID       string     `db:"user_id"`
	PublicKey    []byte     `db:"public_key"`
	KeyAlgorithm string     `db:"key_algorithm"`
	DeviceName   string     `db:"device_name"`
	CreatedAt    time.Time  `db:"created_at"`
	LastUsedAt   *time.Time `db:"last_used_at"`
	ExpiresAt    time.Time  `db:"expires_at"`
	RevokedAt    *time.Time `db:"revoked_at"`
}

func toDomainDevice(d *deviceDB) *identity.Device {
	return &identity.Device{
		ID:           identity.DeviceID(d.ID),
		UserID:       identity.UserID(d.UserID),
		PublicKey:    d.PublicKey,
		KeyAlgorithm: d.KeyAlgorithm,
		DeviceName:   d.DeviceName,
		CreatedAt:    d.CreatedAt,
		LastUsedAt:   d.LastUsedAt,
		ExpiresAt:    d.ExpiresAt,
		RevokedAt:    d.RevokedAt,
	}
}

// DeviceStore implements identity.DeviceStore and identity.AuthChallengeStore using db.DB.
type DeviceStore struct {
	db db.DB
}

// NewDeviceStore creates a new DeviceStore.
func NewDeviceStore(database db.DB) *DeviceStore {
	return &DeviceStore{db: database}
}

// CreateDevice inserts a new trusted hardware device record.
func (s *DeviceStore) CreateDevice(ctx context.Context, device *identity.Device) error {
	const op errors.Op = "domain/identity/storage.CreateDevice"

	q, args, err := pgDialect.Insert(goqu.T("devices").Schema("identity")).
		Rows(goqu.Record{
			"id":            string(device.ID),
			"user_id":       string(device.UserID),
			"public_key":    device.PublicKey,
			"key_algorithm": device.KeyAlgorithm,
			"device_name":   device.DeviceName,
			"created_at":    device.CreatedAt,
			"last_used_at":  device.LastUsedAt,
			"expires_at":    device.ExpiresAt,
			"revoked_at":    device.RevokedAt,
		}).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetDeviceByID retrieves a trusted device by its unique ID.
func (s *DeviceStore) GetDeviceByID(ctx context.Context, id identity.DeviceID) (*identity.Device, error) {
	const op errors.Op = "domain/identity/storage.GetDeviceByID"

	q, args, err := pgDialect.From(goqu.T("devices").Schema("identity")).
		Where(goqu.C("id").Eq(string(id))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var record deviceDB
	if err := s.db.Get(ctx, &record, q, args...); err != nil {
		return nil, errors.E(op, err)
	}

	return toDomainDevice(&record), nil
}

// ListDevicesByUserID retrieves all active, non-revoked devices for a given user.
func (s *DeviceStore) ListDevicesByUserID(ctx context.Context, userID identity.UserID) ([]*identity.Device, error) {
	const op errors.Op = "domain/identity/storage.ListDevicesByUserID"

	q, args, err := pgDialect.From(goqu.T("devices").Schema("identity")).
		Where(
			goqu.C("user_id").Eq(string(userID)),
			goqu.C("revoked_at").IsNull(),
		).
		Order(goqu.C("created_at").Desc()).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var records []deviceDB
	if err := s.db.Select(ctx, &records, q, args...); err != nil {
		return nil, errors.E(op, err)
	}

	devices := make([]*identity.Device, len(records))
	for i := range records {
		devices[i] = toDomainDevice(&records[i])
	}
	return devices, nil
}

// UpdateDeviceLastUsed updates the last_used_at timestamp of a trusted device.
func (s *DeviceStore) UpdateDeviceLastUsed(ctx context.Context, id identity.DeviceID, lastUsedAt time.Time) error {
	const op errors.Op = "domain/identity/storage.UpdateDeviceLastUsed"

	q, args, err := pgDialect.Update(goqu.T("devices").Schema("identity")).
		Set(goqu.Record{"last_used_at": lastUsedAt}).
		Where(goqu.C("id").Eq(string(id))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// RevokeDevice marks a trusted device as revoked.
func (s *DeviceStore) RevokeDevice(ctx context.Context, id identity.DeviceID, revokedAt time.Time) error {
	const op errors.Op = "domain/identity/storage.RevokeDevice"

	q, args, err := pgDialect.Update(goqu.T("devices").Schema("identity")).
		Set(goqu.Record{"revoked_at": revokedAt}).
		Where(
			goqu.C("id").Eq(string(id)),
			goqu.C("revoked_at").IsNull(),
		).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// RevokeAllByUserID marks all active trusted devices for a user as revoked.
func (s *DeviceStore) RevokeAllByUserID(ctx context.Context, userID identity.UserID, revokedAt time.Time) error {
	const op errors.Op = "domain/identity/storage.RevokeAllByUserID"

	q, args, err := pgDialect.Update(goqu.T("devices").Schema("identity")).
		Set(goqu.Record{"revoked_at": revokedAt}).
		Where(
			goqu.C("user_id").Eq(string(userID)),
			goqu.C("revoked_at").IsNull(),
		).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// CreateChallenge persists an ephemeral challenge nonce domain entity.
func (s *DeviceStore) CreateChallenge(ctx context.Context, challenge *identity.Challenge) error {
	const op errors.Op = "domain/identity/storage.CreateChallenge"

	q, args, err := pgDialect.Insert(goqu.T("auth_challenges").Schema("identity")).
		Rows(goqu.Record{
			"challenge":  challenge.Nonce,
			"expires_at": challenge.ExpiresAt,
			"created_at": challenge.CreatedAt,
		}).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if _, err := s.db.Exec(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// DeleteChallenge removes an active challenge nonce from storage.
// Returns errors.NotExist if the challenge was not found or has expired.
func (s *DeviceStore) DeleteChallenge(ctx context.Context, challenge string) error {
	const op errors.Op = "domain/identity/storage.DeleteChallenge"

	q, args, err := pgDialect.Delete(goqu.T("auth_challenges").Schema("identity")).
		Where(
			goqu.C("challenge").Eq(challenge),
			goqu.C("expires_at").Gt(time.Now().UTC()),
		).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}

	if err := s.db.ExecOne(ctx, q, args...); err != nil {
		return errors.E(op, err)
	}

	return nil
}
