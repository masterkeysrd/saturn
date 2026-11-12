package mail

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSanitizeHTML(t *testing.T) {
	tests := []struct {
		name                 string
		input                string
		opts                 []SanitizeOption
		expectedContains     []string
		expectedNotContains  []string
		expectedRemoteImages bool
		expectedCIDs         []string
	}{
		{
			name:                 "empty string",
			input:                "",
			expectedContains:     nil,
			expectedRemoteImages: false,
		},
		{
			name:                 "strips script tags and inner text",
			input:                `<div>Hello <script>alert('xss');</script>World</div>`,
			expectedContains:     []string{"Hello", "World"},
			expectedNotContains:  []string{"<script>", "</script>", "alert('xss')", "xss"},
			expectedRemoteImages: false,
		},
		{
			name:                 "strips malformed nested script tags",
			input:                `<<SCRIPT>alert("XSS");//<</SCRIPT><div>Safe content</div>`,
			expectedContains:     []string{"Safe content"},
			expectedNotContains:  []string{"<script", "</script>", "alert(\"XSS\")"},
			expectedRemoteImages: false,
		},
		{
			name:                 "strips iframe, object, embed, applet",
			input:                `<div><iframe src="https://evil.com"></iframe><object data="bad.swf"></object><embed src="bad.swf"></embed><applet code="Bad.class"></applet>Content</div>`,
			expectedContains:     []string{"Content"},
			expectedNotContains:  []string{"<iframe", "<object", "<embed", "<applet", "evil.com", "bad.swf", "Bad.class"},
			expectedRemoteImages: false,
		},
		{
			name:                 "strips form and input tags to prevent email phishing",
			input:                `<form action="https://phishing.com/login"><input type="password" name="pass"><button type="submit">Login</button></form><p>Please note</p>`,
			expectedContains:     []string{"Please note"},
			expectedNotContains:  []string{"<form", "</form>", "<input", "<button", "phishing.com"},
			expectedRemoteImages: false,
		},
		{
			name:                 "strips meta http-equiv refresh and base tag",
			input:                `<base href="https://evil.com/"><meta http-equiv="refresh" content="0;url=https://evil.com"><span>Safe</span>`,
			expectedContains:     []string{"Safe"},
			expectedNotContains:  []string{"<base", "http-equiv", "evil.com"},
			expectedRemoteImages: false,
		},
		{
			name:                 "strips on* event handlers on elements",
			input:                `<img src="safe.png" onload="alert('img')" onerror="alert('err')"><a href="#" onclick="alert('click')">Link</a>`,
			expectedContains:     []string{"safe.png", "Link"},
			expectedNotContains:  []string{"onload", "onerror", "onclick", "alert("},
			expectedRemoteImages: false,
		},
		{
			name:                 "neutralizes SVG script and SVG onload",
			input:                `<svg onload="alert('svg')"><circle r="10"/><script>alert('svg-script')</script></svg>`,
			expectedContains:     []string{"<circle", "r=\"10\""},
			expectedNotContains:  []string{"onload", "alert('svg')", "<script", "svg-script"},
			expectedRemoteImages: false,
		},
		{
			name:                 "strips javascript: and vbscript: links",
			input:                `<a href="javascript:alert(1)">Click Me</a><a href="vbscript:msgbox(1)">VBS</a><a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">Data</a>`,
			expectedContains:     []string{"Click Me", "VBS", "Data"},
			expectedNotContains:  []string{"href=\"javascript:", "href=\"vbscript:", "href=\"data:text/html"},
			expectedRemoteImages: false,
		},
		{
			name:                 "enforces target blank and rel noopener noreferrer on external links",
			input:                `<a href="https://saturn.example.com/login">Login here</a>`,
			expectedContains:     []string{`href="https://saturn.example.com/login"`, `target="_blank"`, `rel="noopener noreferrer"`, "Login here"},
			expectedRemoteImages: false,
		},
		{
			name:                 "blocks remote images and converts to data-saturn-remote-src",
			input:                `<img src="https://tracker.example.com/pixel.gif" alt="Pixel">`,
			expectedContains:     []string{`data-saturn-remote-src="https://tracker.example.com/pixel.gif"`, `alt="Pixel"`},
			expectedNotContains:  []string{` src="https://tracker.example.com/pixel.gif"`, ` src="`},
			expectedRemoteImages: true,
		},
		{
			name:  "rewrites cid: image with custom CID resolver without flagging remote tracker",
			input: `<img src="cid:logo.png@example.com" alt="Company Logo">`,
			opts: []SanitizeOption{
				WithCIDResolver(func(cid string) string {
					return "https://saturn.local/attachments/" + cid
				}),
			},
			expectedContains:     []string{`src="https://saturn.local/attachments/logo.png@example.com"`, `alt="Company Logo"`},
			expectedNotContains:  []string{`data-saturn-remote-src`},
			expectedRemoteImages: false,
			expectedCIDs:         []string{"logo.png@example.com"},
		},
		{
			name:                 "neutralizes CSS url(https://tracker...) in style attributes",
			input:                `<div style="background-image: url('https://tracker.example.com/bg.png'); color: red;">Styled</div>`,
			expectedContains:     []string{"color: red", "Styled"},
			expectedNotContains:  []string{"https://tracker.example.com/bg.png"},
			expectedRemoteImages: true,
		},
		{
			name:                 "neutralizes CSS expression and dangerous styles",
			input:                `<div style="width: expression(alert(1)); -moz-binding: url('bad.xml'); font-size: 14px;">Text</div>`,
			expectedContains:     []string{"font-size: 14px", "Text"},
			expectedNotContains:  []string{"expression", "-moz-binding", "alert(1)"},
			expectedRemoteImages: false,
		},
		{
			name:                 "preserves safe inline data:image URIs without flagging remote tracker",
			input:                `<img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" alt="Dot">`,
			expectedContains:     []string{`src="data:image/png;base64,`, `alt="Dot"`},
			expectedNotContains:  []string{`data-saturn-remote-src`},
			expectedRemoteImages: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result, err := SanitizeHTML(tt.input, tt.opts...)
			require.NoError(t, err)
			require.NotNil(t, result)

			for _, exp := range tt.expectedContains {
				assert.Contains(t, result.SanitizedHTML, exp)
			}
			for _, notExp := range tt.expectedNotContains {
				assert.NotContains(t, result.SanitizedHTML, notExp)
			}
			assert.Equal(t, tt.expectedRemoteImages, result.HasRemoteImages)

			if len(tt.expectedCIDs) > 0 {
				assert.ElementsMatch(t, tt.expectedCIDs, result.ReferencedCIDs)
			}
		})
	}
}

func TestParseMIME(t *testing.T) {
	t.Run("single part plain text", func(t *testing.T) {
		raw := "From: Alice <alice@example.com>\r\n" +
			"To: Bob <bob@example.com>\r\n" +
			"Subject: Simple Message\r\n" +
			"Date: Mon, 10 Feb 2025 12:00:00 +0000\r\n" +
			"Content-Type: text/plain; charset=utf-8\r\n" +
			"\r\n" +
			"Hello, this is a plain text email.\r\n"

		msg, err := ParseMIME(strings.NewReader(raw))
		require.NoError(t, err)
		assert.Equal(t, "Alice", msg.Sender.Name)
		assert.Equal(t, "alice@example.com", msg.Sender.Email)
		assert.Equal(t, "Simple Message", msg.Subject)
		assert.Contains(t, msg.PlainText, "Hello, this is a plain text email.")
		assert.Contains(t, msg.SanitizedHTML, "Hello, this is a plain text email.")
		assert.False(t, msg.HasRemoteImages)
		assert.Empty(t, msg.Attachments)
	})

	t.Run("RFC 2047 encoded subject and sender", func(t *testing.T) {
		raw := "From: =?UTF-8?B?U2F0dXJuIFRlYW0=?= <team@saturn.app>\r\n" +
			"To: Bob <bob@example.com>\r\n" +
			"Subject: =?UTF-8?B?V2VsY29tZSB0byBTYXR1cm4g8J+agA==?=\r\n" +
			"Content-Type: text/plain\r\n" +
			"\r\n" +
			"Welcome onboard!\r\n"

		msg, err := ParseMIME(strings.NewReader(raw))
		require.NoError(t, err)
		assert.Equal(t, "Saturn Team", msg.Sender.Name)
		assert.Equal(t, "team@saturn.app", msg.Sender.Email)
		assert.Equal(t, "Welcome to Saturn 🚀", msg.Subject)
		assert.Contains(t, msg.PlainText, "Welcome onboard!")
	})

	t.Run("multipart alternative with HTML and PlainText", func(t *testing.T) {
		raw := "From: Alice <alice@example.com>\r\n" +
			"To: Bob <bob@example.com>\r\n" +
			"Subject: Multipart Alternative\r\n" +
			"Content-Type: multipart/alternative; boundary=\"boundary-alt-123\"\r\n" +
			"\r\n" +
			"--boundary-alt-123\r\n" +
			"Content-Type: text/plain; charset=utf-8\r\n" +
			"\r\n" +
			"Plain text representation\r\n" +
			"--boundary-alt-123\r\n" +
			"Content-Type: text/html; charset=utf-8\r\n" +
			"\r\n" +
			"<p>HTML <strong>representation</strong></p>\r\n" +
			"--boundary-alt-123--\r\n"

		msg, err := ParseMIME(strings.NewReader(raw))
		require.NoError(t, err)
		assert.Contains(t, msg.PlainText, "Plain text representation")
		assert.Contains(t, msg.SanitizedHTML, "<strong>representation</strong>")
	})

	t.Run("multipart mixed with regular attachment and inline CID image", func(t *testing.T) {
		raw := "From: Alice <alice@example.com>\r\n" +
			"To: Bob <bob@example.com>\r\n" +
			"Subject: Invoice & Logo\r\n" +
			"Content-Type: multipart/mixed; boundary=\"mixed-boundary\"\r\n" +
			"\r\n" +
			"--mixed-boundary\r\n" +
			"Content-Type: multipart/related; boundary=\"related-boundary\"\r\n" +
			"\r\n" +
			"--related-boundary\r\n" +
			"Content-Type: text/html; charset=utf-8\r\n" +
			"\r\n" +
			"<p>See attached logo: <img src=\"cid:logo-img@saturn.app\"></p>\r\n" +
			"--related-boundary\r\n" +
			"Content-Type: image/png\r\n" +
			"Content-Disposition: inline; filename=\"logo.png\"\r\n" +
			"Content-ID: <logo-img@saturn.app>\r\n" +
			"Content-Transfer-Encoding: base64\r\n" +
			"\r\n" +
			"iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAAAAAA6fptVAAAACklEQVR4nGNiAAAABgADNjd8qAAAAABJRU5ErkJggg==\r\n" +
			"--related-boundary--\r\n" +
			"--mixed-boundary\r\n" +
			"Content-Type: application/pdf\r\n" +
			"Content-Disposition: attachment; filename=\"invoice_2025.pdf\"\r\n" +
			"Content-Transfer-Encoding: base64\r\n" +
			"\r\n" +
			"JVBERi0xLjQKJcTl8uXrp/Og0MTGCjQgMCBvYmoKPDwKL0ZpbHRlciAvRmxhdGVEZWNvZGUKL0xlbmd0aCAxMwo+PgpzdHJlYW0KeJwrVAgAQrQCxAoDAFmKBAEKZW5kc3RyZWFtCmVuZG9iagp0cmFpbGVyCjw8Ci9Sb290IDUgMCBSCj4+CiUlRU9GCg==\r\n" +
			"--mixed-boundary--\r\n"

		msg, err := ParseMIME(strings.NewReader(raw), WithCIDResolver(func(cid string) string {
			return "/v1/attachments/cid/" + cid
		}))
		require.NoError(t, err)

		assert.Contains(t, msg.SanitizedHTML, `/v1/attachments/cid/logo-img@saturn.app`)
		assert.False(t, msg.HasRemoteImages)

		// Verify extracted attachment metadata
		require.Len(t, msg.Attachments, 2)

		var inlinePart, filePart *AttachmentMeta
		for i := range msg.Attachments {
			if msg.Attachments[i].IsInline {
				inlinePart = &msg.Attachments[i]
			} else {
				filePart = &msg.Attachments[i]
			}
		}

		require.NotNil(t, inlinePart)
		assert.Equal(t, "logo.png", inlinePart.Filename)
		assert.Equal(t, "image/png", inlinePart.ContentType)
		assert.Equal(t, "logo-img@saturn.app", inlinePart.ContentID)
		assert.True(t, inlinePart.IsInline)
		assert.True(t, inlinePart.Size > 0)
		assert.True(t, strings.HasPrefix(inlinePart.ID, "mat_"))

		require.NotNil(t, filePart)
		assert.Equal(t, "invoice_2025.pdf", filePart.Filename)
		assert.Equal(t, "application/pdf", filePart.ContentType)
		assert.False(t, filePart.IsInline)
		assert.True(t, filePart.Size > 0)
		assert.True(t, strings.HasPrefix(filePart.ID, "mat_"))
	})
}

func TestFormatRFC5322Address(t *testing.T) {
	p := Participant{Name: "Alice Wonderland", Email: "alice@example.com"}
	assert.Equal(t, "Alice Wonderland <alice@example.com>", FormatRFC5322Address(p))

	pOnlyEmail := Participant{Email: "bob@example.com"}
	assert.Equal(t, "bob@example.com", FormatRFC5322Address(pOnlyEmail))

	pSpecial := Participant{Name: "Smith, John", Email: "john@example.com"}
	assert.Equal(t, `"Smith, John" <john@example.com>`, FormatRFC5322Address(pSpecial))

	list := []Participant{p, pOnlyEmail}
	assert.Equal(t, "Alice Wonderland <alice@example.com>, bob@example.com", FormatRFC5322AddressList(list))
}
