package mail

import (
	"fmt"
	"strings"
)

// publicEmailDomains contains generic free/personal webmail providers where
// a company brand logo should not represent the individual sender.
var publicEmailDomains = map[string]struct{}{
	"gmail.com":      {},
	"googlemail.com": {},
	"yahoo.com":      {},
	"ymail.com":      {},
	"hotmail.com":    {},
	"outlook.com":    {},
	"live.com":       {},
	"msn.com":        {},
	"icloud.com":     {},
	"me.com":         {},
	"mac.com":        {},
	"aol.com":        {},
	"proton.me":      {},
	"protonmail.com": {},
	"zoho.com":       {},
	"gmx.com":        {},
	"mail.com":       {},
}

// ResolveParticipantAvatar determines the best avatar URL and verification status
// for an email participant using a hybrid BIMI and domain-favicon pipeline.
func ResolveParticipantAvatar(email string, headers map[string]string) (avatarURL string, isVerified bool) {
	cleanEmail := strings.TrimSpace(email)
	if cleanEmail == "" || !strings.Contains(cleanEmail, "@") {
		return "", false
	}

	parts := strings.Split(cleanEmail, "@")
	domain := strings.ToLower(strings.TrimSpace(parts[len(parts)-1]))
	if domain == "" || !strings.Contains(domain, ".") {
		return "", false
	}

	// 1. Check BIMI (Brand Indicators for Message Identification)
	// If the sender published BIMI and authentication passed, use the verified BIMI SVG logo.
	if headers != nil {
		bimiLocation := strings.TrimSpace(headers["bimi-location"])
		authResults := strings.ToLower(headers["authentication-results"])
		if bimiLocation != "" && (strings.Contains(authResults, "bimi=pass") || strings.Contains(authResults, "dkim=pass")) {
			return bimiLocation, true
		}
	}

	// 2. Filter out generic public webmail providers (personal accounts should use initial fallbacks)
	if _, isPublic := publicEmailDomains[domain]; isPublic {
		return "", false
	}

	// 3. Resolve high-resolution brand favicon for corporate and organization domains
	return fmt.Sprintf("https://www.google.com/s2/favicons?domain=%s&sz=128", domain), false
}
