package mail

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestResolveParticipantAvatar(t *testing.T) {
	tests := []struct {
		name           string
		email          string
		headers        map[string]string
		wantAvatarURL  string
		wantIsVerified bool
	}{
		{
			name:  "BIMI verified header takes highest priority",
			email: "support@pinterest.com",
			headers: map[string]string{
				"bimi-location":          "https://pinterest.com/bimi/logo.svg",
				"authentication-results": "mx.google.com; bimi=pass header.d=pinterest.com",
			},
			wantAvatarURL:  "https://pinterest.com/bimi/logo.svg",
			wantIsVerified: true,
		},
		{
			name:  "Corporate domain without BIMI resolves to high-res favicon",
			email: "billing@stripe.com",
			headers: map[string]string{
				"authentication-results": "mx.google.com; spf=pass",
			},
			wantAvatarURL:  "https://www.google.com/s2/favicons?domain=stripe.com&sz=128",
			wantIsVerified: false,
		},
		{
			name:           "Generic public webmail domain (gmail) returns empty for initial fallback",
			email:          "john.doe@gmail.com",
			headers:        nil,
			wantAvatarURL:  "",
			wantIsVerified: false,
		},
		{
			name:           "Generic public webmail domain (outlook) returns empty",
			email:          "jane@outlook.com",
			headers:        map[string]string{},
			wantAvatarURL:  "",
			wantIsVerified: false,
		},
		{
			name:           "Empty email address",
			email:          "",
			headers:        nil,
			wantAvatarURL:  "",
			wantIsVerified: false,
		},
		{
			name:           "Malformed email address without at sign",
			email:          "invalid-email-string",
			headers:        nil,
			wantAvatarURL:  "",
			wantIsVerified: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			gotURL, gotVerified := ResolveParticipantAvatar(tt.email, tt.headers)
			assert.Equal(t, tt.wantAvatarURL, gotURL)
			assert.Equal(t, tt.wantIsVerified, gotVerified)
		})
	}
}
