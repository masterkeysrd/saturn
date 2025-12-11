package space

import (
	"context"
	"fmt"

	"github.com/masterkeysrd/saturn/internal/foundation/fieldmask"
	"github.com/masterkeysrd/saturn/internal/foundation/id"
)

type Service struct {
	spaceStore      SpaceStore
	membershipStore MembershipStore
}

type ServiceParameters struct {
	SpaceStore      SpaceStore
	MembershipStore MembershipStore
}

func NewService(params ServiceParameters) *Service {
	return &Service{
		spaceStore:      params.SpaceStore,
		membershipStore: params.MembershipStore,
	}
}

func (s *Service) Create(ctx context.Context, ownerID UserID, space *Space) error {
	if err := id.Validate(ownerID); err != nil {
		return fmt.Errorf("invalid owner ID: %w", err)
	}

	if err := space.Initialize(ownerID); err != nil {
		return fmt.Errorf("failed to initialize space: %w", err)
	}

	space.Sanitize()
	if err := space.Validate(); err != nil {
		return fmt.Errorf("invalid space: %w", err)
	}

	membership := &Membership{
		ID: MembershipID{
			SpaceID: space.ID,
			UserID:  ownerID,
		},
		Role: RoleOwner,
	}
	if err := membership.Initialize(ownerID); err != nil {
		return fmt.Errorf("failed to initialize membership: %w", err)
	}
	if err := membership.Validate(); err != nil {
		return fmt.Errorf("invalid membership: %w", err)
	}

	if err := s.spaceStore.Store(ctx, space); err != nil {
		return fmt.Errorf("failed to store space: %w", err)
	}

	if err := s.membershipStore.Store(ctx, membership); err != nil {
		return fmt.Errorf("failed to store membership: %w", err)
	}

	return nil
}

func (s *Service) Update(ctx context.Context, principal UserID, update *Space, fields *fieldmask.FieldMask) error {
	if err := id.Validate(principal); err != nil {
		return fmt.Errorf("invalid principal ID: %w", err)
	}

	if update == nil {
		return fmt.Errorf("update space is nil")
	}

	if err := id.Validate(update.ID); err != nil {
		return fmt.Errorf("invalid space ID: %w", err)
	}

	space, err := s.spaceStore.Get(ctx, update.ID)
	if err != nil {
		return fmt.Errorf("failed to retrieve space: %w", err)
	}

	member, err := s.membershipStore.Get(ctx, MembershipID{
		SpaceID: space.ID,
		UserID:  principal,
	})
	if err != nil {
		return fmt.Errorf("failed to retrieve membership: %w", err)
	}

	if !member.CanManageSpace() {
		return fmt.Errorf("principal does not have permission to update space")
	}

	if err := space.Update(update, fields); err != nil {
		return fmt.Errorf("failed to apply updates to space: %w", err)
	}

	space.Sanitize()
	space.Touch(principal)
	if err := space.Validate(); err != nil {
		return fmt.Errorf("invalid updated space: %w", err)
	}

	if err := s.spaceStore.Store(ctx, space); err != nil {
		return fmt.Errorf("failed to store updated space: %w", err)
	}

	return nil
}
