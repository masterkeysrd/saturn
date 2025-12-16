package identity

type ByUserID UserID

// isDeleteSessionCriteria marks the criteria as a delete session criteria.
func (ByUserID) isDeleteSessionCriteria() {}

type ByUsername string

// isExistsCredentialCriteria marks the criteria as an exists credential criteria.
func (ByUsername) isExistsCredentialCriteria() {}

func (ByUsername) isUserExistCriteria() {}

type ByEmail string

// isExistsCredentialCriteria marks the criteria as an exists credential criteria.
func (ByEmail) isExistsCredentialCriteria() {}

// isUserExistCriteria marks the criteria as a user exist criteria.
func (ByEmail) isUserExistCriteria() {}

// ByIdentifier allows filtering credentials by their identifier (username or email).
type ByIdentifier string

// isGetsCredentialCriteria marks the criteria as a gets credential criteria.
func (ByIdentifier) isGetCredentialCriteria() {}
