package mnemo

import (
	"errors"
	"time"
)

var (
	ErrTypeMismatch = errors.New("type mismatch")
)

type item struct {
	k   Kind
	s   string
	i   int64
	a   any
	exp int64
}

func (it item) IsExpired() bool {
	return time.Now().UnixNano() > it.exp
}

func (it item) String() (string, error) {
	if it.k != KindString {
		return "", ErrTypeMismatch
	}

	return it.s, nil
}

func (it item) Int64() (int64, error) {
	if it.k != KindInt64 {
		return 0, ErrTypeMismatch
	}

	return it.i, nil
}

func (it item) Any() (any, error) {
	if it.k != KindAny {
		return nil, ErrTypeMismatch
	}

	return it.a, nil
}

type Kind uint8

const (
	KindString Kind = iota + 1
	KindInt64
	KindAny
)
