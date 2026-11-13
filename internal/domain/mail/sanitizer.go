package mail

import (
	"bytes"
	"encoding/base64"
	"io"
	"mime"
	"mime/multipart"
	"mime/quotedprintable"
	"net/mail"
	"regexp"
	"strings"
	"time"

	"github.com/masterkeysrd/saturn/internal/platform/errors"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

var (
	// Dangerous tags where the tag and all its children/content must be completely removed.
	tagsToRemoveWithSubtree = map[atom.Atom]bool{
		atom.Script:   true,
		atom.Iframe:   true,
		atom.Object:   true,
		atom.Embed:    true,
		atom.Applet:   true,
		atom.Base:     true,
		atom.Form:     true,
		atom.Input:    true,
		atom.Button:   true,
		atom.Textarea: true,
		atom.Select:   true,
		atom.Keygen:   true,
		atom.Frame:    true,
		atom.Frameset: true,
	}

	// Regexp to match CSS url(...) references.
	cssURLRegex = regexp.MustCompile(`(?i)url\s*\(\s*([^)]*?)\s*\)`)

	// Regexp to match dangerous CSS properties/expressions.
	cssDangerousRegex = regexp.MustCompile(`(?i)(expression|javascript|behavior|vbscript|-moz-binding|@import)`)

	// Regexp to detect whitespace collapsing in snippets.
	whitespaceRegex = regexp.MustCompile(`\s+`)
)

// SanitizeOptions configures HTML sanitization behavior.
type SanitizeOptions struct {
	CIDResolver func(cid string) string
}

// SanitizeOption is a functional option for SanitizeOptions.
type SanitizeOption func(*SanitizeOptions)

// WithCIDResolver provides a resolver function for src="cid:..." attributes.
func WithCIDResolver(fn func(cid string) string) SanitizeOption {
	return func(o *SanitizeOptions) {
		o.CIDResolver = fn
	}
}

// SanitizeResult holds the output of HTML sanitization.
type SanitizeResult struct {
	SanitizedHTML   string
	PlainText       string
	HasRemoteImages bool
	ReferencedCIDs  []string
}

// SanitizeHTML sanitizes untrusted email HTML according to OWASP guidelines,
// neutralizing scripts, form phishing, external image trackers, and dangerous links.
func SanitizeHTML(rawHTML string, opts ...SanitizeOption) (*SanitizeResult, error) {
	options := &SanitizeOptions{}
	for _, opt := range opts {
		if opt != nil {
			opt(options)
		}
	}

	if strings.TrimSpace(rawHTML) == "" {
		return &SanitizeResult{
			SanitizedHTML:  "",
			PlainText:      "",
			ReferencedCIDs: []string{},
		}, nil
	}

	doc, err := html.Parse(strings.NewReader(rawHTML))
	if err != nil {
		return nil, errors.E(errors.Invalid, "parse html: %w", err)
	}

	res := &SanitizeResult{
		ReferencedCIDs: []string{},
	}

	sanitizeNode(doc, options, res)

	var buf bytes.Buffer

	// Extract and render all sanitized <style> nodes (from <head> or document root)
	var styles []*html.Node
	var findStyles func(*html.Node)
	findStyles = func(node *html.Node) {
		if node == nil {
			return
		}
		if node.Type == html.ElementNode && (node.DataAtom == atom.Style || strings.EqualFold(node.Data, "style")) {
			styles = append(styles, node)
			return
		}
		for c := node.FirstChild; c != nil; c = c.NextSibling {
			findStyles(c)
		}
	}
	findStyles(doc)

	for _, st := range styles {
		if err := html.Render(&buf, st); err != nil {
			return nil, errors.E(errors.Internal, "render sanitized style: %w", err)
		}
	}

	// Find the body or render from root
	bodyNode := findBody(doc)
	if bodyNode != nil {
		for child := bodyNode.FirstChild; child != nil; child = child.NextSibling {
			if child.Type == html.ElementNode && (child.DataAtom == atom.Style || strings.EqualFold(child.Data, "style")) {
				continue
			}
			if err := html.Render(&buf, child); err != nil {
				return nil, errors.E(errors.Internal, "render sanitized html: %w", err)
			}
		}
	} else {
		if err := html.Render(&buf, doc); err != nil {
			return nil, errors.E(errors.Internal, "render sanitized html: %w", err)
		}
	}

	res.SanitizedHTML = buf.String()
	res.PlainText = extractVisibleText(doc)

	return res, nil
}

func findBody(n *html.Node) *html.Node {
	if n == nil {
		return nil
	}
	if n.Type == html.ElementNode && n.DataAtom == atom.Body {
		return n
	}
	for c := n.FirstChild; c != nil; c = c.NextSibling {
		if found := findBody(c); found != nil {
			return found
		}
	}
	return nil
}

func sanitizeNode(n *html.Node, opts *SanitizeOptions, res *SanitizeResult) {
	if n == nil {
		return
	}

	// Iterate over children first to remove dangerous subtrees safely
	var nextChild *html.Node
	for c := n.FirstChild; c != nil; c = nextChild {
		nextChild = c.NextSibling
		if c.Type == html.ElementNode {
			// Strip dangerous tags and their contents
			isScript := c.DataAtom == atom.Script || strings.EqualFold(c.Data, "script")
			isIframe := c.DataAtom == atom.Iframe || strings.EqualFold(c.Data, "iframe")
			isObject := c.DataAtom == atom.Object || strings.EqualFold(c.Data, "object")
			isEmbed := c.DataAtom == atom.Embed || strings.EqualFold(c.Data, "embed")
			if tagsToRemoveWithSubtree[c.DataAtom] || isScript || isIframe || isObject || isEmbed {
				n.RemoveChild(c)
				continue
			}

			// Strip <meta http-equiv="..."> tags
			if c.DataAtom == atom.Meta {
				hasHTTPEquiv := false
				for _, a := range c.Attr {
					if strings.EqualFold(a.Key, "http-equiv") {
						hasHTTPEquiv = true
						break
					}
				}
				if hasHTTPEquiv {
					n.RemoveChild(c)
					continue
				}
			}

			// Strip external <link rel="stylesheet"> or prefetch
			if c.DataAtom == atom.Link {
				n.RemoveChild(c)
				continue
			}

			// Strip SVG scripts or dangerous SVG elements
			if c.DataAtom == atom.Svg || isInSVG(c) {
				if c.Data == "script" || c.Data == "animate" || c.Data == "set" || c.Data == "handler" {
					n.RemoveChild(c)
					continue
				}
			}
		}

		sanitizeNode(c, opts, res)
	}

	if n.Type == html.ElementNode {
		sanitizeElement(n, opts, res)
	}
}

func isInSVG(n *html.Node) bool {
	for p := n.Parent; p != nil; p = p.Parent {
		if p.DataAtom == atom.Svg {
			return true
		}
	}
	return false
}

func sanitizeElement(n *html.Node, opts *SanitizeOptions, res *SanitizeResult) {
	var cleanAttrs []html.Attribute
	isLink := n.DataAtom == atom.A || n.DataAtom == atom.Area
	isImage := n.DataAtom == atom.Img || n.DataAtom == atom.Image
	var hrefVal string
	var hasTarget, hasRel bool

	for _, a := range n.Attr {
		keyLower := strings.ToLower(a.Key)

		// 1. Strip all on* event handlers (onload, onerror, onclick, etc.)
		if strings.HasPrefix(keyLower, "on") {
			continue
		}

		// 2. Strip srcdoc, ping, formaction
		if keyLower == "srcdoc" || keyLower == "ping" || keyLower == "formaction" || keyLower == "action" {
			continue
		}

		// 3. Link href sanitization
		if (keyLower == "href" || keyLower == "xlink:href") && isLink {
			val := strings.TrimSpace(a.Val)
			if isDangerousURI(val) {
				continue
			}
			hrefVal = val
			cleanAttrs = append(cleanAttrs, a)
			continue
		}

		// 4. Image src and srcset rewriting (remote tracker protection & cid: rewriting)
		if isImage && keyLower == "src" {
			srcVal := strings.TrimSpace(a.Val)
			cleanSrc := strings.TrimPrefix(srcVal, "CID:")
			cleanSrc = strings.TrimPrefix(cleanSrc, "cid:")
			isCID := cleanSrc != srcVal || strings.HasPrefix(strings.ToLower(srcVal), "cid:")

			if isCID {
				cid := strings.Trim(cleanSrc, "<>")
				res.ReferencedCIDs = append(res.ReferencedCIDs, cid)
				resolvedSrc := srcVal
				if opts.CIDResolver != nil {
					resolvedSrc = opts.CIDResolver(cid)
				}
				cleanAttrs = append(cleanAttrs, html.Attribute{
					Key: "src",
					Val: resolvedSrc,
				})
				continue
			}

			if isRemoteURL(srcVal) {
				res.HasRemoteImages = true
				cleanAttrs = append(cleanAttrs, html.Attribute{
					Key: "data-saturn-remote-src",
					Val: srcVal,
				})
				continue
			}

			if strings.HasPrefix(strings.ToLower(srcVal), "data:image/") {
				// Safe data image
				cleanAttrs = append(cleanAttrs, a)
				continue
			}

			if isDangerousURI(srcVal) {
				continue
			}

			cleanAttrs = append(cleanAttrs, a)
			continue
		}

		// 5. Image srcset rewriting
		if isImage && keyLower == "srcset" {
			if strings.Contains(a.Val, "http://") || strings.Contains(a.Val, "https://") || strings.Contains(a.Val, "//") {
				res.HasRemoteImages = true
				cleanAttrs = append(cleanAttrs, html.Attribute{
					Key: "data-saturn-remote-srcset",
					Val: a.Val,
				})
				continue
			}
			cleanAttrs = append(cleanAttrs, a)
			continue
		}

		// 6. Background attribute tracker check
		if keyLower == "background" {
			if isRemoteURL(a.Val) {
				res.HasRemoteImages = true
				cleanAttrs = append(cleanAttrs, html.Attribute{
					Key: "data-saturn-remote-background",
					Val: a.Val,
				})
				continue
			}
			cleanAttrs = append(cleanAttrs, a)
			continue
		}

		// 7. Style attribute sanitization
		if keyLower == "style" {
			sanitizedStyle, hasRemote := sanitizeStyleAttribute(a.Val)
			if hasRemote {
				res.HasRemoteImages = true
			}
			if sanitizedStyle != "" {
				cleanAttrs = append(cleanAttrs, html.Attribute{
					Key: "style",
					Val: sanitizedStyle,
				})
			}
			continue
		}

		if keyLower == "target" && isLink {
			hasTarget = true
			cleanAttrs = append(cleanAttrs, html.Attribute{Key: "target", Val: "_blank"})
			continue
		}

		if keyLower == "rel" && isLink {
			hasRel = true
			cleanAttrs = append(cleanAttrs, html.Attribute{Key: "rel", Val: "noopener noreferrer"})
			continue
		}

		cleanAttrs = append(cleanAttrs, a)
	}

	// Enforce target="_blank" and rel="noopener noreferrer" on external links
	if isLink && hrefVal != "" && isRemoteURL(hrefVal) {
		if !hasTarget {
			cleanAttrs = append(cleanAttrs, html.Attribute{Key: "target", Val: "_blank"})
		}
		if !hasRel {
			cleanAttrs = append(cleanAttrs, html.Attribute{Key: "rel", Val: "noopener noreferrer"})
		}
	}

	// For <style> tags: sanitize CSS content directly
	if n.DataAtom == atom.Style {
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			if c.Type == html.TextNode {
				sanitizedCSS, hasRemote := sanitizeCSSContent(c.Data)
				if hasRemote {
					res.HasRemoteImages = true
				}
				c.Data = sanitizedCSS
			}
		}
	}

	n.Attr = cleanAttrs
}

func isRemoteURL(u string) bool {
	trimmed := strings.ToLower(strings.TrimSpace(u))
	return strings.HasPrefix(trimmed, "http://") ||
		strings.HasPrefix(trimmed, "https://") ||
		strings.HasPrefix(trimmed, "//")
}

func isDangerousURI(raw string) bool {
	clean := strings.ToLower(strings.TrimSpace(raw))
	// Strip control characters
	var sb strings.Builder
	for _, r := range clean {
		if r > 32 && r < 127 {
			sb.WriteRune(r)
		}
	}
	s := sb.String()

	if strings.HasPrefix(s, "javascript:") ||
		strings.HasPrefix(s, "vbscript:") ||
		strings.HasPrefix(s, "data:text/html") ||
		strings.HasPrefix(s, "data:image/svg+xml") {
		return true
	}

	return false
}

func sanitizeStyleAttribute(style string) (string, bool) {
	hasRemote := false

	decls := strings.Split(style, ";")
	var cleanDecls []string
	for _, decl := range decls {
		trimmed := strings.TrimSpace(decl)
		if trimmed == "" {
			continue
		}

		// Discard dangerous declarations entirely (expression, behavior, -moz-binding, etc.)
		if cssDangerousRegex.MatchString(trimmed) {
			continue
		}

		// Check and strip remote URLs in this declaration
		if cssURLRegex.MatchString(trimmed) {
			matches := cssURLRegex.FindAllStringSubmatch(trimmed, -1)
			for _, m := range matches {
				if len(m) > 1 {
					urlPart := strings.Trim(strings.TrimSpace(m[1]), `'"`)
					if isRemoteURL(urlPart) {
						hasRemote = true
					}
				}
			}
			trimmed = cssURLRegex.ReplaceAllStringFunc(trimmed, func(match string) string {
				sub := cssURLRegex.FindStringSubmatch(match)
				if len(sub) > 1 {
					urlPart := strings.Trim(strings.TrimSpace(sub[1]), `'"`)
					if isRemoteURL(urlPart) {
						return "none"
					}
				}
				return match
			})
		}

		cleanDecls = append(cleanDecls, trimmed)
	}

	if len(cleanDecls) == 0 {
		return "", hasRemote
	}
	return strings.Join(cleanDecls, "; ") + ";", hasRemote
}

func sanitizeCSSContent(css string) (string, bool) {
	hasRemote := false

	if cssDangerousRegex.MatchString(css) {
		css = cssDangerousRegex.ReplaceAllString(css, "")
	}

	if cssURLRegex.MatchString(css) {
		matches := cssURLRegex.FindAllStringSubmatch(css, -1)
		for _, m := range matches {
			if len(m) > 1 {
				urlPart := strings.Trim(strings.TrimSpace(m[1]), `'"`)
				if isRemoteURL(urlPart) {
					hasRemote = true
				}
			}
		}
		css = cssURLRegex.ReplaceAllStringFunc(css, func(match string) string {
			sub := cssURLRegex.FindStringSubmatch(match)
			if len(sub) > 1 {
				urlPart := strings.Trim(strings.TrimSpace(sub[1]), `'"`)
				if isRemoteURL(urlPart) {
					return "none"
				}
			}
			return match
		})
	}

	return strings.TrimSpace(css), hasRemote
}

func extractVisibleText(n *html.Node) string {
	var sb strings.Builder
	var walk func(*html.Node)
	walk = func(node *html.Node) {
		if node == nil {
			return
		}
		if node.Type == html.ElementNode {
			// Skip hidden elements or non-content
			if node.DataAtom == atom.Script || node.DataAtom == atom.Style || node.DataAtom == atom.Head {
				return
			}
		}
		if node.Type == html.TextNode {
			text := strings.TrimSpace(node.Data)
			if text != "" {
				sb.WriteString(text)
				sb.WriteString(" ")
			}
		}
		for c := node.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
		if node.Type == html.ElementNode {
			switch node.DataAtom {
			case atom.P, atom.Div, atom.Br, atom.Tr, atom.H1, atom.H2, atom.H3, atom.H4, atom.H5, atom.H6, atom.Li:
				sb.WriteString("\n")
			}
		}
	}
	walk(n)

	raw := sb.String()
	lines := strings.Split(raw, "\n")
	var cleanedLines []string
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed != "" {
			cleanedLines = append(cleanedLines, whitespaceRegex.ReplaceAllString(trimmed, " "))
		}
	}
	return strings.Join(cleanedLines, "\n")
}

// ParsedMIMEMessage holds extracted metadata, body contents, and attachments from a MIME stream.
type ParsedMIMEMessage struct {
	Sender          Participant
	To              []Participant
	Cc              []Participant
	Bcc             []Participant
	ReplyTo         []Participant
	Subject         string
	RFCMessageID    string
	InReplyTo       string
	References      string
	SentAt          *time.Time
	ReceivedAt      time.Time
	HTML            string
	PlainText       string
	SanitizedHTML   string
	Snippet         string
	HasRemoteImages bool
	Attachments     []AttachmentMeta
}

// ParseMIME parses raw RFC 5322 MIME email data, decoding multipart boundaries,
// transfer encodings, RFC 2047 headers, and extracting sanitized body and attachments.
func ParseMIME(r io.Reader, opts ...SanitizeOption) (*ParsedMIMEMessage, error) {
	msg, err := mail.ReadMessage(r)
	if err != nil {
		return nil, errors.E(errors.Invalid, "read mail message: %w", err)
	}

	decoder := new(mime.WordDecoder)
	decodeHdr := func(hdr string) string {
		if hdr == "" {
			return ""
		}
		decoded, err := decoder.DecodeHeader(hdr)
		if err != nil {
			return hdr
		}
		return decoded
	}

	parseAddressList := func(raw string) []Participant {
		if strings.TrimSpace(raw) == "" {
			return []Participant{}
		}
		addrs, err := mail.ParseAddressList(raw)
		if err != nil {
			// Fallback: decode RFC 2047 and return single address
			decoded := decodeHdr(raw)
			return []Participant{{Email: strings.TrimSpace(decoded)}}
		}
		var result []Participant
		for _, addr := range addrs {
			name := decodeHdr(addr.Name)
			result = append(result, Participant{
				Name:  strings.TrimSpace(name),
				Email: strings.TrimSpace(addr.Address),
			})
		}
		return result
	}

	var sender Participant
	fromAddrs := parseAddressList(msg.Header.Get("From"))
	if len(fromAddrs) > 0 {
		sender = fromAddrs[0]
	}

	subject := decodeHdr(msg.Header.Get("Subject"))
	rfcMsgID := strings.Trim(msg.Header.Get("Message-ID"), "<>")
	inReplyTo := strings.Trim(msg.Header.Get("In-Reply-To"), "<>")
	references := msg.Header.Get("References")

	var sentAt *time.Time
	if dateStr := msg.Header.Get("Date"); dateStr != "" {
		if parsedDate, err := mail.ParseDate(dateStr); err == nil {
			u := parsedDate.UTC()
			sentAt = &u
		}
	}

	receivedAt := time.Now().UTC()
	if sentAt != nil {
		receivedAt = *sentAt
	}

	parsed := &ParsedMIMEMessage{
		Sender:       sender,
		To:           parseAddressList(msg.Header.Get("To")),
		Cc:           parseAddressList(msg.Header.Get("Cc")),
		Bcc:          parseAddressList(msg.Header.Get("Bcc")),
		ReplyTo:      parseAddressList(msg.Header.Get("Reply-To")),
		Subject:      subject,
		RFCMessageID: rfcMsgID,
		InReplyTo:    inReplyTo,
		References:   references,
		SentAt:       sentAt,
		ReceivedAt:   receivedAt,
		Attachments:  []AttachmentMeta{},
	}

	contentType := msg.Header.Get("Content-Type")
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		// Fallback: read body directly as text/plain
		bodyBytes, _ := io.ReadAll(msg.Body)
		parsed.PlainText = string(bodyBytes)
	} else if strings.HasPrefix(mediaType, "multipart/") {
		boundary := params["boundary"]
		if boundary != "" {
			if err := parseMultipartBody(msg.Body, boundary, parsed, decoder); err != nil {
				return nil, err
			}
		}
	} else {
		encoding := msg.Header.Get("Content-Transfer-Encoding")
		bodyBytes, err := decodeTransferEncoding(msg.Body, encoding)
		if err == nil {
			if mediaType == "text/html" {
				parsed.HTML = string(bodyBytes)
			} else {
				parsed.PlainText = string(bodyBytes)
			}
		}
	}

	// Sanitize extracted HTML or synthesize from plain text
	if strings.TrimSpace(parsed.HTML) != "" {
		sanitized, err := SanitizeHTML(parsed.HTML, opts...)
		if err != nil {
			return nil, err
		}
		parsed.SanitizedHTML = sanitized.SanitizedHTML
		parsed.HasRemoteImages = sanitized.HasRemoteImages
		if strings.TrimSpace(parsed.PlainText) == "" {
			parsed.PlainText = sanitized.PlainText
		}
	} else if strings.TrimSpace(parsed.PlainText) != "" {
		// Generate basic safe HTML from plain text
		escaped := html.EscapeString(parsed.PlainText)
		parsed.SanitizedHTML = "<pre style=\"white-space: pre-wrap; font-family: sans-serif;\">" + escaped + "</pre>"
	}

	// Generate snippet
	cleanSnippet := strings.TrimSpace(whitespaceRegex.ReplaceAllString(parsed.PlainText, " "))
	if len(cleanSnippet) > 160 {
		cleanSnippet = cleanSnippet[:160] + "..."
	}
	parsed.Snippet = cleanSnippet

	return parsed, nil
}

func parseMultipartBody(r io.Reader, boundary string, out *ParsedMIMEMessage, dec *mime.WordDecoder) error {
	mr := multipart.NewReader(r, boundary)
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil // truncated part or error, finish gracefully
		}

		partContentType := part.Header.Get("Content-Type")
		mediaType, params, err := mime.ParseMediaType(partContentType)
		if err != nil {
			mediaType = "application/octet-stream"
		}

		disposition := part.Header.Get("Content-Disposition")
		dispType, dispParams, _ := mime.ParseMediaType(disposition)
		contentID := strings.Trim(part.Header.Get("Content-ID"), "<>")

		filename := part.FileName()
		if filename == "" && dispParams != nil {
			filename = dispParams["filename"]
		}
		if filename == "" && params != nil {
			filename = params["name"]
		}
		if filename != "" {
			if decoded, err := dec.DecodeHeader(filename); err == nil {
				filename = decoded
			}
		}

		encoding := part.Header.Get("Content-Transfer-Encoding")

		if strings.HasPrefix(mediaType, "multipart/") {
			nestedBoundary := params["boundary"]
			if nestedBoundary != "" {
				_ = parseMultipartBody(part, nestedBoundary, out, dec)
			}
			continue
		}

		isInline := strings.EqualFold(dispType, "inline") || contentID != ""
		isAttachment := strings.EqualFold(dispType, "attachment") || (filename != "" && !isInline)

		if !isAttachment && !isInline && mediaType == "text/plain" {
			data, err := decodeTransferEncoding(part, encoding)
			if err == nil {
				out.PlainText = strings.TrimSpace(out.PlainText + "\n" + string(data))
			}
			continue
		}

		if !isAttachment && !isInline && mediaType == "text/html" {
			data, err := decodeTransferEncoding(part, encoding)
			if err == nil {
				out.HTML = strings.TrimSpace(out.HTML + "\n" + string(data))
			}
			continue
		}

		// Read attachment / inline part bytes to determine size without storing raw blob in memory long-term
		partData, err := decodeTransferEncoding(part, encoding)
		size := int64(len(partData))
		if err != nil {
			size = 0
		}

		attID, _ := GenerateAttachmentID()
		out.Attachments = append(out.Attachments, AttachmentMeta{
			ID:          attID,
			Filename:    filename,
			ContentType: mediaType,
			Size:        size,
			ContentID:   contentID,
			IsInline:    isInline,
		})
	}
	return nil
}

func decodeTransferEncoding(r io.Reader, encoding string) ([]byte, error) {
	enc := strings.ToLower(strings.TrimSpace(encoding))
	switch enc {
	case "base64":
		raw, err := io.ReadAll(r)
		if err != nil {
			return nil, err
		}
		// Clean linebreaks from base64
		cleaned := strings.Map(func(r rune) rune {
			if r == '\n' || r == '\r' || r == ' ' || r == '\t' {
				return -1
			}
			return r
		}, string(raw))
		decoded, err := base64.StdEncoding.DecodeString(cleaned)
		if err != nil {
			// Fallback: try raw decode or url safe
			if dec2, err2 := base64.RawStdEncoding.DecodeString(cleaned); err2 == nil {
				return dec2, nil
			}
			return raw, nil
		}
		return decoded, nil
	case "quoted-printable":
		return io.ReadAll(quotedprintable.NewReader(r))
	default:
		return io.ReadAll(r)
	}
}

// FormatRFC5322Address formats a Participant into a valid RFC 5322 address.
func FormatRFC5322Address(p Participant) string {
	name := strings.TrimSpace(p.Name)
	email := strings.TrimSpace(p.Email)
	if name == "" {
		return email
	}
	if strings.ContainsAny(name, ",<>\"") {
		name = `"` + strings.ReplaceAll(name, `"`, `\"`) + `"`
	}
	return name + " <" + email + ">"
}

// FormatRFC5322AddressList formats a slice of Participants.
func FormatRFC5322AddressList(participants []Participant) string {
	var list []string
	for _, p := range participants {
		formatted := FormatRFC5322Address(p)
		if formatted != "" {
			list = append(list, formatted)
		}
	}
	return strings.Join(list, ", ")
}
