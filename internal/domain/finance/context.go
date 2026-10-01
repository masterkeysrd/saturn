package finance

import "time"

// RequestContext represents the workspace execution context required by finance domain operations and stores.
type Context interface {
	SpaceID() SpaceID
	UserID() string
	Location() *time.Location
	BaseCurrency() Currency
	Now() time.Time
	Date(t time.Time) time.Time
}

// RequestContext is an alias for Context for backwards compatibility.
type RequestContext = Context

// SimpleContext provides an in-memory implementation of RequestContext for tests and callers with known parameters.
type SimpleContext struct {
	spaceID      SpaceID
	userID       string
	location     *time.Location
	baseCurrency Currency
}

// NewRequestContext creates a new SimpleContext with safe defaults (time.UTC if loc is nil).
func NewRequestContext(spaceID SpaceID, userID string, loc *time.Location, baseCurrency Currency) Context {
	if loc == nil {
		loc = time.UTC
	}
	return &SimpleContext{
		spaceID:      spaceID,
		userID:       userID,
		location:     loc,
		baseCurrency: baseCurrency,
	}
}

// NewContext creates a new SimpleContext with safe defaults (time.UTC if loc is nil).
func NewContext(spaceID SpaceID, userID string, loc *time.Location, baseCurrency Currency) Context {
	return NewRequestContext(spaceID, userID, loc, baseCurrency)
}

// SpaceID returns the active workspace ID.
func (c *SimpleContext) SpaceID() SpaceID { return c.spaceID }

// UserID returns the authenticated user ID.
func (c *SimpleContext) UserID() string { return c.userID }

// Location returns the workspace timezone location.
func (c *SimpleContext) Location() *time.Location { return c.location }

// BaseCurrency returns the workspace base currency.
func (c *SimpleContext) BaseCurrency() Currency { return c.baseCurrency }

// Now returns the current time in the workspace timezone.
func (c *SimpleContext) Now() time.Time { return time.Now().In(c.location) }

// Date returns t converted to the workspace timezone, defaulting to Now() if zero.
func (c *SimpleContext) Date(t time.Time) time.Time {
	if t.IsZero() {
		return c.Now()
	}
	return t.In(c.location)
}
