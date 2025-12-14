package tenancypg

import (
	"context"
	"fmt"
	"time"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/foundation/auth"
)

var _ tenancy.MembershipStore = (*MembershipStore)(nil)

const (
	upsertMembershipSQL = `
INSERT INTO tenancy.memberships (space_id, user_id, role, join_time, create_by, create_time, update_by, update_time)
VALUES (:space_id, :user_id, :role, :join_time, :create_by, :create_time, :update_by, :update_time)
ON CONFLICT (space_id, user_id) DO UPDATE SET
  role = EXCLUDED.role,
  join_time = EXCLUDED.join_time,
  update_by = EXCLUDED.update_by,
  update_time = EXCLUDED.update_time;
`
)

type MembershipStore struct {
	db *sqlx.DB
}

func NewMembershipStore(db *sqlx.DB) *MembershipStore {
	return &MembershipStore{db: db}
}

func (s *MembershipStore) Get(ctx context.Context, id tenancy.MembershipID) (*tenancy.Membership, error) {
	return nil, nil
}

func (s *MembershipStore) ListBy(ctx context.Context, criteria tenancy.ListMembershipsCriteria) ([]*tenancy.Membership, error) {
	return nil, nil
}

func (s *MembershipStore) Store(ctx context.Context, membership *tenancy.Membership) error {
	result, err := s.db.NamedExecContext(ctx, upsertMembershipSQL, NewMembershipEntityFromModel(membership))
	if err != nil {
		return err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if rowsAffected == 0 {
		return fmt.Errorf("no rows affected when upserting membership")
	}

	return nil
}

func (s *MembershipStore) Delete(ctx context.Context, id tenancy.MembershipID) error {
	return nil
}

type MembershipEntity struct {
	SpaceID    tenancy.SpaceID `db:"space_id"`
	UserID     tenancy.UserID  `db:"user_id"`
	Role       tenancy.Role    `db:"role"`
	JoinTime   time.Time       `db:"join_time"`
	CreateBy   auth.UserID     `db:"create_by"`
	CreateTime time.Time       `db:"create_time"`
	UpdateBy   auth.UserID     `db:"update_by"`
	UpdateTime time.Time       `db:"update_time"`
}

func NewMembershipEntityFromModel(m *tenancy.Membership) *MembershipEntity {
	return &MembershipEntity{
		SpaceID:    m.SpaceID,
		UserID:     m.UserID,
		Role:       m.Role,
		JoinTime:   m.JoinTime,
		CreateBy:   m.CreatedBy,
		CreateTime: m.CreateTime,
		UpdateBy:   m.UpdatedBy,
		UpdateTime: m.UpdateTime,
	}
}
