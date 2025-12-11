package auth

// Role represents the role of a user.
type Role string

func (r Role) String() string {
	return string(r)
}

const (
	RoleAdmin Role = "admin" // Administrator role
	RoleUser  Role = "user"  // Regular user role
)

var roles = map[Role]struct{}{
	RoleAdmin: {},
	RoleUser:  {},
}

// IsValid checks if the Role is a valid predefined role.
func (r Role) IsValid() bool {
	_, exists := roles[r]
	return exists
}
