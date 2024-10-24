package uuid

import "github.com/google/uuid"

type UUID string

func New() (UUID, error) {
	id, err := uuid.NewV7()
	if err != nil {
		return "", err
	}

	return UUID(id.String()), nil
}

func NewFromStr(s string) (UUID, error) {
	id, err := uuid.Parse(s)
	if err != nil {
		return "", err
	}

	return UUID(id.String()), nil
}

func NewFromStrPtr(s *string) (UUID, error) {
	if s == nil {
		return "", nil
	}

	return NewFromStr(*s)
}

func Empty() UUID {
	return UUID("")
}

func (u UUID) String() string {
	return string(u)
}

func (u UUID) GoogleUUID() (uuid.UUID, error) {
	return uuid.Parse(string(u))
}
