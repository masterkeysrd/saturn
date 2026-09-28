package storage

import (
	"context"
	"encoding/json"
	"time"

	"github.com/doug-martin/goqu/v9"
	"github.com/lib/pq"
	"github.com/masterkeysrd/saturn/internal/domain/identity"
	"github.com/masterkeysrd/saturn/internal/platform/db"
	"github.com/masterkeysrd/saturn/internal/platform/errors"
)

type mfaFactorDB struct {
	ID         string     `db:"id"`
	UserID     string     `db:"user_id"`
	Type       string     `db:"type"`
	Name       string     `db:"name"`
	Config     []byte     `db:"config"`
	IsPrimary  bool       `db:"is_primary"`
	CreatedAt  time.Time  `db:"created_at"`
	LastUsedAt *time.Time `db:"last_used_at"`
	RevokedAt  *time.Time `db:"revoked_at"`
}

type mfaRecoveryDB struct {
	UserID      string         `db:"user_id"`
	BackupCodes pq.StringArray `db:"backup_codes"`
	UpdatedAt   time.Time      `db:"updated_at"`
}

type totpConfigJSON struct {
	EncryptedSecret string `json:"encrypted_secret"`
}

func marshalFactorConfig(factor *identity.MFAFactor) ([]byte, error) {
	if factor == nil || factor.Config == nil {
		return []byte("{}"), nil
	}
	switch factor.Type {
	case identity.MFAFactorTypeTOTP:
		totpCfg := factor.TOTPConfig()
		if totpCfg != nil {
			return json.Marshal(totpConfigJSON{
				EncryptedSecret: totpCfg.EncryptedSecret,
			})
		}
		return json.Marshal(factor.Config)
	default:
		return json.Marshal(factor.Config)
	}
}

func unmarshalFactorConfig(factorType identity.MFAFactorType, raw []byte) (identity.MFAConfig, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	switch factorType {
	case identity.MFAFactorTypeTOTP:
		var c totpConfigJSON
		if err := json.Unmarshal(raw, &c); err != nil {
			return nil, err
		}
		return &identity.TOTPConfig{
			EncryptedSecret: c.EncryptedSecret,
		}, nil
	default:
		return nil, nil
	}
}

// MFAFactorStore implements identity.MFAFactorStore using db.DB.
type MFAFactorStore struct {
	db db.DB
}

// NewMFAFactorStore creates a new MFAFactorStore.
func NewMFAFactorStore(database db.DB) *MFAFactorStore {
	return &MFAFactorStore{db: database}
}

var _ identity.MFAFactorStore = (*MFAFactorStore)(nil)

func toDomainFactor(record *mfaFactorDB) (*identity.MFAFactor, error) {
	cfg, err := unmarshalFactorConfig(identity.MFAFactorType(record.Type), record.Config)
	if err != nil {
		return nil, err
	}
	return &identity.MFAFactor{
		ID:         identity.MFAFactorID(record.ID),
		UserID:     identity.UserID(record.UserID),
		Type:       identity.MFAFactorType(record.Type),
		Name:       record.Name,
		Config:     cfg,
		IsPrimary:  record.IsPrimary,
		CreatedAt:  record.CreatedAt,
		LastUsedAt: record.LastUsedAt,
		RevokedAt:  record.RevokedAt,
	}, nil
}

// CreateFactor inserts a new MFA factor into identity.mfa_factors.
func (s *MFAFactorStore) CreateFactor(ctx context.Context, factor *identity.MFAFactor) error {
	const op errors.Op = "domain/identity/storage.CreateFactor"

	configBytes, err := marshalFactorConfig(factor)
	if err != nil {
		return errors.E(op, err)
	}

	q, args, err := pgDialect.Insert(goqu.T("mfa_factors").Schema("identity")).
		Rows(goqu.Record{
			"id":           string(factor.ID),
			"user_id":      string(factor.UserID),
			"type":         string(factor.Type),
			"name":         factor.Name,
			"config":       configBytes,
			"is_primary":   factor.IsPrimary,
			"created_at":   factor.CreatedAt,
			"last_used_at": factor.LastUsedAt,
			"revoked_at":   factor.RevokedAt,
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

// GetFactorByID retrieves an MFA factor by its unique ID.
func (s *MFAFactorStore) GetFactorByID(ctx context.Context, id identity.MFAFactorID) (*identity.MFAFactor, error) {
	const op errors.Op = "domain/identity/storage.GetFactorByID"

	q, args, err := pgDialect.From(goqu.T("mfa_factors").Schema("identity")).
		Where(goqu.C("id").Eq(string(id))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbRecord mfaFactorDB
	if err := s.db.Get(ctx, &dbRecord, q, args...); err != nil {
		return nil, errors.E(op, err)
	}
	domainFactor, err := toDomainFactor(&dbRecord)
	if err != nil {
		return nil, errors.E(op, err)
	}
	return domainFactor, nil
}

// ListFactorsByUserID returns all non-revoked MFA factors for a user, ordered by creation time.
func (s *MFAFactorStore) ListFactorsByUserID(ctx context.Context, userID identity.UserID) ([]*identity.MFAFactor, error) {
	const op errors.Op = "domain/identity/storage.ListFactorsByUserID"

	q, args, err := pgDialect.From(goqu.T("mfa_factors").Schema("identity")).
		Where(
			goqu.C("user_id").Eq(string(userID)),
			goqu.C("revoked_at").IsNull(),
		).
		Order(goqu.C("created_at").Asc()).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var records []mfaFactorDB
	if err := s.db.Select(ctx, &records, q, args...); err != nil {
		return nil, errors.E(op, err)
	}

	factors := make([]*identity.MFAFactor, 0, len(records))
	for i := range records {
		f, err := toDomainFactor(&records[i])
		if err != nil {
			return nil, errors.E(op, err)
		}
		factors = append(factors, f)
	}
	return factors, nil
}

// UpdateFactor updates mutable fields on an existing factor.
func (s *MFAFactorStore) UpdateFactor(ctx context.Context, factor *identity.MFAFactor) error {
	const op errors.Op = "domain/identity/storage.UpdateFactor"

	configBytes, err := marshalFactorConfig(factor)
	if err != nil {
		return errors.E(op, err)
	}

	q, args, err := pgDialect.Update(goqu.T("mfa_factors").Schema("identity")).
		Set(goqu.Record{
			"name":         factor.Name,
			"config":       configBytes,
			"is_primary":   factor.IsPrimary,
			"last_used_at": factor.LastUsedAt,
			"revoked_at":   factor.RevokedAt,
		}).
		Where(goqu.C("id").Eq(string(factor.ID))).
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

// DeleteFactor soft-deletes a factor by setting revoked_at to now.
func (s *MFAFactorStore) DeleteFactor(ctx context.Context, id identity.MFAFactorID, now time.Time) error {
	const op errors.Op = "domain/identity/storage.DeleteFactor"

	q, args, err := pgDialect.Update(goqu.T("mfa_factors").Schema("identity")).
		Set(goqu.Record{
			"revoked_at": now,
		}).
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

// SetPrimaryFactor sets a specific factor as primary and unsets any previous primary factors for the user.
func (s *MFAFactorStore) SetPrimaryFactor(ctx context.Context, userID identity.UserID, factorID identity.MFAFactorID) error {
	const op errors.Op = "domain/identity/storage.SetPrimaryFactor"

	// Reset existing primaries
	resetQ, resetArgs, err := pgDialect.Update(goqu.T("mfa_factors").Schema("identity")).
		Set(goqu.Record{"is_primary": false}).
		Where(
			goqu.C("user_id").Eq(string(userID)),
			goqu.C("revoked_at").IsNull(),
		).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if _, err := s.db.Exec(ctx, resetQ, resetArgs...); err != nil {
		return errors.E(op, err)
	}

	// Set target factor as primary
	setQ, setArgs, err := pgDialect.Update(goqu.T("mfa_factors").Schema("identity")).
		Set(goqu.Record{"is_primary": true}).
		Where(
			goqu.C("id").Eq(string(factorID)),
			goqu.C("user_id").Eq(string(userID)),
			goqu.C("revoked_at").IsNull(),
		).
		Prepared(true).
		ToSQL()
	if err != nil {
		return errors.E(op, err)
	}
	if err := s.db.ExecOne(ctx, setQ, setArgs...); err != nil {
		return errors.E(op, err)
	}
	return nil
}

// GetRecovery retrieves the backup recovery codes record for a user.
func (s *MFAFactorStore) GetRecovery(ctx context.Context, userID identity.UserID) (*identity.MFARecovery, error) {
	const op errors.Op = "domain/identity/storage.GetRecovery"

	q, args, err := pgDialect.From(goqu.T("mfa_recovery").Schema("identity")).
		Where(goqu.C("user_id").Eq(string(userID))).
		Prepared(true).
		ToSQL()
	if err != nil {
		return nil, errors.E(op, err)
	}

	var dbRecord mfaRecoveryDB
	if err := s.db.Get(ctx, &dbRecord, q, args...); err != nil {
		return nil, errors.E(op, err)
	}

	return &identity.MFARecovery{
		UserID:      identity.UserID(dbRecord.UserID),
		BackupCodes: []string(dbRecord.BackupCodes),
		UpdatedAt:   dbRecord.UpdatedAt,
	}, nil
}

// UpsertRecovery inserts or updates backup recovery codes for a user.
func (s *MFAFactorStore) UpsertRecovery(ctx context.Context, recovery *identity.MFARecovery) error {
	const op errors.Op = "domain/identity/storage.UpsertRecovery"

	const query = `
		INSERT INTO identity.mfa_recovery (user_id, backup_codes, updated_at)
		VALUES ($1, $2, $3)
		ON CONFLICT (user_id) DO UPDATE SET
			backup_codes = EXCLUDED.backup_codes,
			updated_at = EXCLUDED.updated_at
	`

	if _, err := s.db.Exec(ctx, query, string(recovery.UserID), pq.StringArray(recovery.BackupCodes), recovery.UpdatedAt); err != nil {
		return errors.E(op, err)
	}
	return nil
}
