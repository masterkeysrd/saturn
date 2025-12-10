package auth

type UserPassport struct {
	UserID   string
	Username string
	Email    string
	Role     Role
}
