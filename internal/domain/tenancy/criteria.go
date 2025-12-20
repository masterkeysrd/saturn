package tenancy

// BySpaceID represents a criteria to list spaces by a single ID.
type BySpaceID SpaceID

// isListMembershipsCriteria marks BySpaceID as a ListMembershipsCriteria.
func (c BySpaceID) isListMembershipsCriteria() {}

type ByUserID UserID

// isListMembershipsCriteria marks ByUserID as a ListMembershipsCriteria.
func (c ByUserID) isListMembershipsCriteria() {}

// BySpaceIDs represents a criteria to list spaces by their IDs.
type BySpaceIDs []SpaceID

// isListSpacesCriteria marks BySpaceIDs as a ListSpacesCriteria.
func (c BySpaceIDs) isListSpacesCriteria() {}

type ByUserIDs []UserID

// isListSpacesCriteria marks ByUserIDs as a ListSpacesCriteria.
func (c ByUserIDs) isListSpacesCriteria() {}
