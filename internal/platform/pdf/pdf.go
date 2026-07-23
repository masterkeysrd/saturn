package pdf

import (
	"bytes"
	"fmt"
	"strings"

	"github.com/ledongthuc/pdf"
	pdfcpuapi "github.com/pdfcpu/pdfcpu/pkg/api"
	"github.com/pdfcpu/pdfcpu/pkg/pdfcpu/model"
)

// IsEncrypted checks if the PDF is password-protected.
func IsEncrypted(pdfData []byte) (bool, error) {
	rs := bytes.NewReader(pdfData)
	conf := model.NewDefaultConfiguration()
	ctx, err := pdfcpuapi.ReadContext(rs, conf)
	if err != nil {
		errStr := err.Error()
		if strings.Contains(errStr, "password") || strings.Contains(errStr, "encrypted") {
			return true, nil
		}
		return false, err
	}
	return ctx.Encrypt != nil, nil
}

// Decrypt attempts to decrypt password-protected PDF data in-memory.
func Decrypt(pdfData []byte, password string) ([]byte, error) {
	rs := bytes.NewReader(pdfData)
	var out bytes.Buffer

	conf := model.NewDefaultConfiguration()
	conf.UserPW = password
	conf.OwnerPW = password

	err := pdfcpuapi.Decrypt(rs, &out, conf)
	if err != nil {
		return nil, fmt.Errorf("decrypt: %w", err)
	}
	return out.Bytes(), nil
}

// ExtractText extracts plaintext contents from a decrypted PDF byte array.
func ExtractText(pdfData []byte) (string, error) {
	rs := bytes.NewReader(pdfData)
	size := int64(len(pdfData))

	r, err := pdf.NewReader(rs, size)
	if err != nil {
		return "", fmt.Errorf("new pdf reader: %w", err)
	}

	var buf bytes.Buffer
	numPages := r.NumPage()
	maxPages := numPages
	if maxPages > 5 {
		maxPages = 5
	}
	for i := 1; i <= maxPages; i++ {
		page := r.Page(i)
		if page.V.IsNull() {
			continue
		}
		text, err := page.GetPlainText(nil)
		if err != nil {
			return "", fmt.Errorf("get page %d text: %w", i, err)
		}
		buf.WriteString(text)
		buf.WriteByte('\n')
	}

	return buf.String(), nil
}
