package space

import "github.com/masterkeysrd/saturn/internal/platform/errors"

// Error codes for the space domain.
const (
	NotFound            errors.Code = "SPACE_NOT_FOUND"
	NameExists          errors.Code = "SPACE_NAME_EXISTS"
	OwnerOnly           errors.Code = "SPACE_OWNER_ONLY"
	InsufficientRole    errors.Code = "INSUFFICIENT_ROLE"
	MemberNotFound      errors.Code = "MEMBER_NOT_FOUND"
	MemberAlreadyExists errors.Code = "MEMBER_ALREADY_EXISTS"
	InvalidRole         errors.Code = "INVALID_ROLE"
)
