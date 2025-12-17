package auth

// SessionID represents a unique identifier for a user session.
type SessionID string

func (sid SessionID) String() string {
	return string(sid)
}
