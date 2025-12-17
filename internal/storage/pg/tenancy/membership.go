package tenancypg

import (
	"context"
	"fmt"

	"github.com/jmoiron/sqlx"
	"github.com/masterkeysrd/saturn/internal/domain/tenancy"
	"github.com/masterkeysrd/saturn/internal/pkg/ptr"
)

var _ tenancy.MembershipStore = (*MembershipStore)(nil)

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
	result, err := s.db.NamedExecContext(ctx, UpsertMembershipQuery, NewMembershipEntityFromModel(membership))
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

func NewMembershipEntityFromModel(m *tenancy.Membership) *MembershipEntity {
	return &MembershipEntity{
		SpaceId:    m.SpaceID.String(),
		UserId:     m.UserID.String(),
		Role:       m.Role.String(),
		JoinTime:   m.JoinTime,
		CreateBy:   ptr.OfNonZero(m.CreateBy.String()),
		CreateTime: m.CreateTime,
		UpdateBy:   ptr.OfNonZero(m.UpdateBy.String()),
		UpdateTime: m.UpdateTime,
	}
}
