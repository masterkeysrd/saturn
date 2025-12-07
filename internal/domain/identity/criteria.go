package identity

// ByUsername allows filtering users by their username.
type ByUsername string

// isUserExistCriteria marks the criteria as a user existence check.
func (ByUsername) isUserExistCriteria() {}

// ByEmail allows filtering users by their email.
type ByEmail string

// isUserExistCriteria marks the criteria as a user existence check.
func (ByEmail) isUserExistCriteria() {}
