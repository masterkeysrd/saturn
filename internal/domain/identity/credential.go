package identity

// Credential represents user authentication credentials.
type Credential struct {
	UserID     UserID `json:"user_id"`
	AuthType   string `json:"auth_type"`
	SecretData string `json:"secret_data"`
}
