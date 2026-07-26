package email

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

	html2md "github.com/JohannesKaufmann/html-to-markdown"
	"github.com/masterkeysrd/saturn/internal/platform/pdf"
)

// Attachment represents an extracted file attachment from the email.
type Attachment struct {
	Filename    string
	ContentType string
	Data        []byte
	Text        string // Extracted plaintext content (e.g. from decrypted PDF)
}

// ParsedEmail holds the parsed metadata, plain text body, and attachments of an email.
type ParsedEmail struct {
	Sender      string
	Subject     string
	Body        string
	Attachments []Attachment
}

// Parse parses a raw SMTP RFC 5322 email message, decoding headers, extracting body/attachments, and decrypting PDFs.
func Parse(r io.Reader, pdfPasswords []string) (*ParsedEmail, error) {
	msg, err := mail.ReadMessage(r)
	if err != nil {
		return nil, err
	}

	dec := new(mime.WordDecoder)
	sender, _ := dec.DecodeHeader(msg.Header.Get("From"))
	subject, _ := dec.DecodeHeader(msg.Header.Get("Subject"))

	parsed := &ParsedEmail{
		Sender:  sender,
		Subject: subject,
	}

	contentType := msg.Header.Get("Content-Type")
	mediaType, params, err := mime.ParseMediaType(contentType)
	if err != nil {
		// Fallback to reading the body directly as plain text if Content-Type parsing fails
		bodyBytes, _ := io.ReadAll(msg.Body)
		parsed.Body = string(bodyBytes)
		return parsed, nil
	}

	var htmlBody string
	if strings.HasPrefix(mediaType, "multipart/") {
		boundary := params["boundary"]
		err = parseMultipart(msg.Body, boundary, parsed, &htmlBody)
		if err != nil {
			return nil, err
		}
	} else {
		// Single part message body
		bodyBytes, err := readPartData(msg.Body, msg.Header.Get("Content-Transfer-Encoding"))
		if err != nil {
			return nil, err
		}
		if mediaType == "text/html" {
			htmlBody = string(bodyBytes)
		} else {
			parsed.Body = string(bodyBytes)
		}
	}

	parsed.Body = strings.TrimSpace(parsed.Body)

	// Fallback to HTML-to-Markdown conversion if plain text is empty/missing
	if parsed.Body == "" && htmlBody != "" {
		md, err := convertHTMLToMarkdown(htmlBody)
		if err == nil {
			parsed.Body = md
		} else {
			// Fallback to basic tag stripping if markdown conversion fails
			parsed.Body = stripHTML(htmlBody)
		}
	}

	// Process and extract text from PDF attachments
	for i, att := range parsed.Attachments {
		if att.ContentType == "application/pdf" || strings.HasSuffix(strings.ToLower(att.Filename), ".pdf") {
			isEnc, err := pdf.IsEncrypted(att.Data)
			if err != nil || !isEnc {
				// Try direct text extraction if not encrypted
				txt, err := pdf.ExtractText(att.Data)
				if err == nil {
					parsed.Attachments[i].Text = txt
				}
				continue
			}

			// PDF is encrypted, try to decrypt with candidates in-memory
			decrypted := false
			for _, pw := range pdfPasswords {
				decryptedBytes, err := pdf.Decrypt(att.Data, pw)
				if err == nil {
					// Update Attachment bytes with decrypted version
					parsed.Attachments[i].Data = decryptedBytes
					txt, err := pdf.ExtractText(decryptedBytes)
					if err == nil {
						parsed.Attachments[i].Text = txt
					}
					decrypted = true
					break
				}
			}

			if !decrypted {
				// Flag that decryption failed
				parsed.Attachments[i].Text = "[Error: Password Protected PDF - Decryption Failed]"
			}
		}
	}

	return parsed, nil
}

// parseMultipart recursively walks through MIME sections to extract plain text body and attachments.
func parseMultipart(r io.Reader, boundary string, parsed *ParsedEmail, htmlBody *string) error {
	mr := multipart.NewReader(r, boundary)
	for {
		part, err := mr.NextPart()
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}

		contentType := part.Header.Get("Content-Type")
		mediaType, params, err := mime.ParseMediaType(contentType)
		if err != nil {
			continue
		}

		// Recursively handle nested multiparts (e.g. multipart/alternative inside multipart/mixed)
		if strings.HasPrefix(mediaType, "multipart/") {
			nestedBoundary := params["boundary"]
			err = parseMultipart(part, nestedBoundary, parsed, htmlBody)
			if err != nil {
				return err
			}
			continue
		}

		// Check if the part is designated as an attachment
		disposition := part.Header.Get("Content-Disposition")
		dispType, dispParams, _ := mime.ParseMediaType(disposition)
		filename := dispParams["filename"]
		if filename == "" {
			filename = params["name"] // fallback to name parameter in Content-Type header
		}

		isAttachment := dispType == "attachment" || filename != ""

		if isAttachment {
			data, err := readPartData(part, part.Header.Get("Content-Transfer-Encoding"))
			if err != nil {
				return err
			}
			parsed.Attachments = append(parsed.Attachments, Attachment{
				Filename:    filename,
				ContentType: mediaType,
				Data:        data,
			})
		} else if mediaType == "text/plain" && parsed.Body == "" {
			// Extract plain text body from the first matching text/plain block
			bodyBytes, err := readPartData(part, part.Header.Get("Content-Transfer-Encoding"))
			if err != nil {
				return err
			}
			parsed.Body = string(bodyBytes)
		} else if mediaType == "text/html" && *htmlBody == "" {
			// Extract HTML body as a fallback
			bodyBytes, err := readPartData(part, part.Header.Get("Content-Transfer-Encoding"))
			if err == nil {
				*htmlBody = string(bodyBytes)
			}
		}
	}
	return nil
}

// readPartData decodes the transfer encoding (quoted-printable or base64) and reads the content bytes.
func readPartData(r io.Reader, encoding string) ([]byte, error) {
	var decoded = r
	switch strings.ToLower(strings.TrimSpace(encoding)) {
	case "quoted-printable":
		decoded = quotedprintable.NewReader(r)
	case "base64":
		rawBytes, err := io.ReadAll(r)
		if err != nil {
			return nil, err
		}
		// Clean base64 payload of any whitespace, newlines, or copy-paste artifacts
		// Whitelist valid base64 alphabet characters, excluding padding '=' (which we normalize below)
		cleanBytes := make([]byte, 0, len(rawBytes))
		for _, b := range rawBytes {
			if (b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z') || (b >= '0' && b <= '9') || b == '+' || b == '/' {
				cleanBytes = append(cleanBytes, b)
			}
		}
		// Add correct padding based on modulo 4
		switch len(cleanBytes) % 4 {
		case 2:
			cleanBytes = append(cleanBytes, '=', '=')
		case 3:
			cleanBytes = append(cleanBytes, '=')
		}
		// Try padded standard base64 first
		dec := base64.NewDecoder(base64.StdEncoding, bytes.NewReader(cleanBytes))
		buf, err := io.ReadAll(dec)
		if err == nil {
			return buf, nil
		}
		// Fallback to unpadded raw base64
		dec = base64.NewDecoder(base64.RawStdEncoding, bytes.NewReader(cleanBytes))
		return io.ReadAll(dec)
	}
	return io.ReadAll(decoded)
}

// convertHTMLToMarkdown parses rich HTML structure into semantic markdown tables, headers, and text.
func convertHTMLToMarkdown(html string) (string, error) {
	converter := html2md.NewConverter("", true, nil)
	markdown, err := converter.ConvertString(html)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(markdown), nil
}

// stripHTML removes styles, headers, HTML tags and decodes common HTML entities to yield clean text.
func stripHTML(html string) string {
	// Remove style blocks completely
	reStyle := regexp.MustCompile(`(?i)<style[^>]*>[\s\S]*?</style>`)
	html = reStyle.ReplaceAllString(html, "")

	// Remove head blocks
	reHead := regexp.MustCompile(`(?i)<head[^>]*>[\s\S]*?</head>`)
	html = reHead.ReplaceAllString(html, "")

	// Replace structural tags with newlines
	reBr := regexp.MustCompile(`(?i)<br\s*/?>`)
	html = reBr.ReplaceAllString(html, "\n")
	reP := regexp.MustCompile(`(?i)</p>|</div>`)
	html = reP.ReplaceAllString(html, "\n")
	reTr := regexp.MustCompile(`(?i)</tr>`)
	html = reTr.ReplaceAllString(html, "\n")

	// Strip all remaining HTML tags
	reTags := regexp.MustCompile(`<[^>]*>`)
	text := reTags.ReplaceAllString(html, "")

	// Decode standard HTML entities
	text = strings.ReplaceAll(text, "&nbsp;", " ")
	text = strings.ReplaceAll(text, "&amp;", "&")
	text = strings.ReplaceAll(text, "&lt;", "<")
	text = strings.ReplaceAll(text, "&gt;", ">")
	text = strings.ReplaceAll(text, "&quot;", "\"")
	text = strings.ReplaceAll(text, "&#39;", "'")
	text = strings.ReplaceAll(text, "&aacute;", "á")
	text = strings.ReplaceAll(text, "&eacute;", "é")
	text = strings.ReplaceAll(text, "&iacute;", "í")
	text = strings.ReplaceAll(text, "&oacute;", "ó")
	text = strings.ReplaceAll(text, "&uacute;", "ú")
	text = strings.ReplaceAll(text, "&ntilde;", "ñ")
	text = strings.ReplaceAll(text, "&Aacute;", "Á")
	text = strings.ReplaceAll(text, "&Eacute;", "É")
	text = strings.ReplaceAll(text, "&Iacute;", "Í")
	text = strings.ReplaceAll(text, "&Oacute;", "Ó")
	text = strings.ReplaceAll(text, "&Uacute;", "Ú")
	text = strings.ReplaceAll(text, "&Ntilde;", "Ñ")
	text = strings.ReplaceAll(text, "=C3=B3", "ó")
	text = strings.ReplaceAll(text, "=C3=A1", "á")
	text = strings.ReplaceAll(text, "=C3=A9", "é")
	text = strings.ReplaceAll(text, "=C3=AD", "í")
	text = strings.ReplaceAll(text, "=C3=BA", "ú")
	text = strings.ReplaceAll(text, "=C3=B1", "ñ")

	// Collapse multiple consecutive newlines and trim whitespace
	lines := strings.Split(text, "\n")
	var cleaned []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" {
			cleaned = append(cleaned, line)
		}
	}
	return strings.Join(cleaned, "\n")
}
