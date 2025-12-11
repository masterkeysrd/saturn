package auth

// UserID represents a unique identifier for a user.
type UserID string

func (uid UserID) String() string {
	return string(uid)
}

// UserPassport represents the essential information about a user
// that is included in authentication tokens and used for authorization.
type UserPassport struct {
	userID   UserID
	username string
	email    string
	role     Role
}

func NewUserPassport(userID UserID, username, email string, role Role) UserPassport {
	return UserPassport{
		userID:   userID,
		username: username,
		email:    email,
		role:     role,
	}
}

func (p UserPassport) UserID() UserID {
	return p.userID
}

func (p UserPassport) Username() string {
	return p.username
}

func (p UserPassport) Email() string {
	return p.email
}

func (p UserPassport) Role() Role {
	return p.role
}

func (p UserPassport) IsAdmin() bool {
	return p.role == RoleAdmin
}

func (p UserPassport) IsZero() bool {
	return p == UserPassport{}
}
