package transport

// Claims represents the claims of a JWT token.
type Claims map[string]any

// Get returns the value of the claim with the given key.
func (c Claims) Get(key string) any {
	return c[key]
}

// GetString returns the string value of the claim with the given key.
func (c Claims) GetString(key string) string {
	if v, ok := c[key].(string); ok {
		return v
	}
	return ""
}
