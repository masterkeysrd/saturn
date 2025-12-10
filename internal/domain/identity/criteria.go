package identity

// ByUserID allows filtering users by their unique ID.
type ByUserID string

// isGetUserCriteria marks the criteria as a get user criteria.
func (ByUserID) isDeleteSessionCriteria() {}

// ByUsername allows filtering users by their username.
type ByUsername string

// isUserExistCriteria marks the criteria as a user existence check.
func (ByUsername) isUserExistCriteria() {}

// ByEmail allows filtering users by their email.
type ByEmail string

// isUserExistCriteria marks the criteria as a user existence check.
func (ByEmail) isUserExistCriteria() {}

// ByUsernameOrEmail allows filtering users by either their username or email.
type ByUsernameOrEmail string

// isUserExistCriteria marks the criteria as a user existence check.
func (ByUsernameOrEmail) isGetUserCriteria() {}
